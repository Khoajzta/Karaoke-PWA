import { endAt, limitToFirst, orderByChild, query } from "firebase/database";
import { get, getServerTime, ref, remove, rtdb, set } from "../firebase";

const SEARCH_CACHE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_EXPIRED_CACHE_ENTRIES_TO_REMOVE = 100;

const getSearchCacheKey = async (queryText) => {
  const bytes = new TextEncoder().encode(queryText);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const isValidSearchResults = (results) => Array.isArray(results) && results.length <= 15 && results.every(
  (item) => typeof item?.videoId === "string" && typeof item?.title === "string" && typeof item?.thumbnail === "string"
);

const removeExpiredSearchCacheEntries = async (now) => {
  if (!rtdb) return;
  const expiredEntriesQuery = query(
    ref(rtdb, "searchCache"),
    orderByChild("expiresAt"),
    endAt(now),
    limitToFirst(MAX_EXPIRED_CACHE_ENTRIES_TO_REMOVE)
  );
  const snapshot = await get(expiredEntriesQuery);
  const removals = [];
  snapshot.forEach((entry) => {
    removals.push(remove(ref(rtdb, `searchCache/${entry.key}`)));
  });
  await Promise.all(removals);
};

// Extract YouTube Video ID from any standard URL, short link, embed, live, shorts, or raw 11-char ID
export const extractYouTubeId = (urlOrId) => {
  if (!urlOrId) return null;
  const str = urlOrId.trim();

  // If already an 11-character YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  try {
    const parsed = new URL(str.startsWith("http") ? str : `https://${str}`);
    if (parsed.hostname.includes("youtube.com")) {
      // e.g. watch?v=...
      if (parsed.searchParams.has("v")) {
        const v = parsed.searchParams.get("v");
        if (v && v.length === 11) return v;
      }
      // e.g. /embed/ID, /v/ID, /shorts/ID, /live/ID
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (["embed", "v", "shorts", "live"].includes(pathParts[0]) && pathParts[1]) {
        return pathParts[1].substring(0, 11);
      }
    } else if (parsed.hostname.includes("youtu.be")) {
      // e.g. youtu.be/ID
      const path = parsed.pathname.replace(/^\/+/, "");
      if (path) return path.substring(0, 11);
    }
  } catch (e) {
    // URL parsing failed, proceed to regex
  }

  // Regex fallback
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i,
    /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
    if (match && match[7] && match[7].length === 11) {
      return match[7];
    }
  }

  return null;
};

// Fetch video info (Multi-tier: YouTube API -> oEmbed -> Direct Thumbnail Fallback)
export const fetchYouTubeOEmbed = async (videoId) => {
  if (!videoId) return null;

  const defaultItem = {
    videoId,
    title: `Karaoke Video (${videoId})`,
    thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    authorName: "YouTube"
  };

  // 1. Try YouTube Data API v3 if API key is present
  let apiKey = "";
  try {
    if (typeof localStorage !== "undefined") {
      apiKey = localStorage.getItem("yt_api_key") || "";
    }
    if (!apiKey && typeof import.meta !== "undefined" && import.meta.env) {
      apiKey = import.meta.env.VITE_YOUTUBE_API_KEY || "";
    }
  } catch (e) {
    apiKey = "";
  }
  if (apiKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          const snip = data.items[0].snippet;
          return {
            videoId,
            title: snip.title,
            thumbnail: snip.thumbnails?.medium?.url || snip.thumbnails?.default?.url || defaultItem.thumbnail,
            authorName: snip.channelTitle || "YouTube"
          };
        }
      }
    } catch (e) {
      console.warn("YouTube Data API fetch by ID failed, falling back to oEmbed", e);
    }
  }

  // 2. Try noembed oEmbed
  try {
    const res = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.title) {
        return {
          videoId,
          title: data.title,
          thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          authorName: data.author_name || "YouTube"
        };
      }
    }
  } catch (error) {
    console.warn("noembed fetch failed, using fallback thumbnail", error);
  }

  // 3. Guaranteed fallback (never throws or leaves user empty-handed)
  return defaultItem;
};

// Search YouTube Data API v3 (automatically appends 'karaoke')
export const searchYouTubeAPI = async (query, apiKey) => {
  const trimmedQuery = query.trim();
  const fullQuery = trimmedQuery.toLowerCase().includes("karaoke") 
    ? trimmedQuery 
    : `${trimmedQuery} karaoke`;

  const cacheQuery = fullQuery.trim().toLocaleLowerCase("vi");
  const now = getServerTime();
  let cacheRef = null;
  if (rtdb) {
    try {
      const cacheKey = await getSearchCacheKey(cacheQuery);
      cacheRef = ref(rtdb, `searchCache/${cacheKey}`);
      const cacheSnapshot = await get(cacheRef);
      const cachedEntry = cacheSnapshot.val();
      if (cachedEntry?.expiresAt > now && isValidSearchResults(cachedEntry.results)) {
        removeExpiredSearchCacheEntries(now).catch((error) => {
          console.warn("Could not clean expired YouTube search cache entries:", error);
        });
        return cachedEntry.results;
      }
      if (cacheSnapshot.exists()) await remove(cacheRef);
    } catch (error) {
      console.warn("Could not read the shared YouTube search cache:", error);
      cacheRef = null;
    }
  }

  if (!apiKey) {
    throw new Error("Tính năng tìm bài hát chưa được bật. Bạn vẫn có thể dán link YouTube để thêm bài hát.");
  }

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=${encodeURIComponent(
    fullQuery
  )}&type=video&key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Lỗi khi tìm kiếm YouTube");
  }

  const results = (data.items || []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
    channelTitle: item.snippet.channelTitle
  }));

  if (cacheRef) {
    try {
      await removeExpiredSearchCacheEntries(now);
      await set(cacheRef, {
        results,
        cachedAt: now,
        expiresAt: now + SEARCH_CACHE_TTL_MS
      });
    } catch (error) {
      console.warn("Could not save the shared YouTube search cache:", error);
    }
  }

  return results;
};
