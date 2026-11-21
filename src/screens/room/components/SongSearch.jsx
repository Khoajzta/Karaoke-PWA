import React, { useEffect, useRef, useState } from "react";
import { 
  Search, 
  Link as LinkIcon, 
  Plus, 
  Play, 
  Sparkles, 
  Loader2, 
  AlertCircle,
  Check,
  ClipboardPaste,
  ArrowRight,
  Mic
} from "lucide-react";
import { extractYouTubeId, fetchYouTubeOEmbed, searchYouTubeAPI } from "../../../utils/youtube";
import { useAuth } from "../../../context/AuthContext";

const fetchYouTubeSuggestions = (query, signal) => new Promise((resolve, reject) => {
  const callbackName = `karaokeSuggestions_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const script = document.createElement("script");
  const url = new URL("https://suggestqueries.google.com/complete/search");
  url.searchParams.set("client", "chrome");
  url.searchParams.set("ds", "yt");
  url.searchParams.set("hl", "vi");
  url.searchParams.set("q", query);
  url.searchParams.set("callback", callbackName);
  script.src = url.toString();

  let timeoutId;
  const cleanup = () => {
    clearTimeout(timeoutId);
    script.remove();
    delete window[callbackName];
    signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => {
    cleanup();
    reject(new DOMException("Suggestion request aborted", "AbortError"));
  };

  window[callbackName] = (data) => {
    cleanup();
    resolve(Array.isArray(data?.[1]) ? data[1].filter((item) => typeof item === "string") : []);
  };
  script.onerror = () => {
    cleanup();
    reject(new Error("Could not load YouTube suggestions"));
  };
  signal.addEventListener("abort", onAbort, { once: true });
  timeoutId = setTimeout(() => {
    cleanup();
    reject(new Error("YouTube suggestions timed out"));
  }, 5000);
  if (signal.aborted) onAbort();
  else document.head.appendChild(script);
});

export const SongSearch = ({
  isHost,
  onAddToQueue,
  onPlayNow,
  onOpenConfig,
  onBack
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("search"); // 'search' | 'url'
  const [searchQuery, setSearchQuery] = useState("");
  const [querySuggestions, setQuerySuggestions] = useState([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef(null);

  // URL paste state
  const [urlInput, setUrlInput] = useState("");
  const [urlPreview, setUrlPreview] = useState(null);
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [urlError, setUrlError] = useState("");

  const [addedId, setAddedId] = useState(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (suggestionsDismissed || query.length < 2 || extractYouTubeId(query)) {
      setQuerySuggestions([]);
      setIsLoadingSuggestions(false);
      setSuggestionError("");
      return undefined;
    }
    const controller = new AbortController();
    setQuerySuggestions([]);
    setSuggestionError("");
    setIsLoadingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        let matches = [];
        let requestError;
        for (const endpoint of ["https://www.google.com/complete/search", "https://suggestqueries.google.com/complete/search"]) {
          try {
            const url = new URL(endpoint);
            url.searchParams.set("client", "firefox");
            url.searchParams.set("ds", "yt");
            url.searchParams.set("hl", "vi");
            url.searchParams.set("q", query);
            const response = await fetch(url, {
              signal: controller.signal,
              mode: "cors",
              headers: { Accept: "application/json" }
            });
            if (!response.ok) throw new Error("Autocomplete request failed");
            const data = await response.json();
            matches = Array.isArray(data?.[1]) ? data[1].filter((item) => typeof item === "string") : [];
            if (matches.length) break;
          } catch (error) {
            if (error.name === "AbortError") throw error;
            requestError = error;
          }
        }
        if (!matches.length) {
          try {
            matches = await fetchYouTubeSuggestions(query, controller.signal);
          } catch (error) {
            if (error.name === "AbortError") throw error;
            if (requestError) throw requestError;
            throw error;
          }
        }
        setQuerySuggestions(matches.slice(0, 8));
        if (matches.length === 0) setSuggestionError("Không tìm thấy gợi ý cho nội dung này.");
      } catch (error) {
        if (error.name !== "AbortError") {
          setQuerySuggestions([]);
          setSuggestionError("Không tải được gợi ý tìm kiếm. Vui lòng thử lại.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingSuggestions(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery, suggestionsDismissed]);

  const toggleVoiceSearch = () => {
    if (isListening) {
      speechRecognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSearchError("Trình duyệt này chưa hỗ trợ tìm kiếm bằng giọng nói.");
      return;
    }

    const recognition = new SpeechRecognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setIsListening(true);
      setSearchError("");
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      setSearchQuery(transcript);
      handleSearch(null, transcript);
    };
    recognition.onerror = (event) => {
      const message = event.error === "not-allowed"
        ? "Vui lòng cấp quyền sử dụng micro để tìm kiếm bằng giọng nói."
        : "Không nhận diện được giọng nói. Vui lòng thử lại.";
      setSearchError(message);
    };
    recognition.onend = () => setIsListening(false);

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setSearchError("Không thể bật micro lúc này. Vui lòng thử lại.");
    }
  };

  useEffect(() => () => speechRecognitionRef.current?.stop(), []);

  // Search or detect pasted URL in search bar
  const handleSearch = async (e, queryOverride) => {
    if (e) e.preventDefault();
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;
    setSuggestionsDismissed(true);
    setQuerySuggestions([]);

    // Check if query is actually a YouTube link!
    const detectedId = extractYouTubeId(query);
    if (detectedId) {
      try {
        setIsSearching(true);
        setSearchError("");
        const info = await fetchYouTubeOEmbed(detectedId);
        setSearchResults([info]);
        setSearchQuery("");
      } catch (err) {
        setSearchError("Không thể lấy thông tin video từ liên kết.");
      } finally {
        setIsSearching(false);
      }
      return;
    }

    // Normal query search via YouTube API
    const apiKey = localStorage.getItem("yt_api_key") || import.meta.env.VITE_YOUTUBE_API_KEY;
    if (!apiKey) {
      setSearchError("Chưa có YouTube API Key! Bạn có thể chuyển sang tab 'Dán Link' hoặc dán thẳng URL YouTube vào đây mà không cần Key.");
      return;
    }

    try {
      setIsSearching(true);
      setSearchError("");
      const results = await searchYouTubeAPI(query, apiKey);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("Không tìm thấy bài hát nào phù hợp.");
      }
    } catch (err) {
      console.error(err);
      setSearchError(err.message || "Lỗi khi tìm kiếm video.");
    } finally {
      setIsSearching(false);
    }
  };

  const suggestions = querySuggestions.map((title) => ({ title, videoId: `query-${title}` }));

  // Resolve pasted URL
  const resolveUrl = async (rawUrl) => {
    const val = rawUrl?.trim();
    if (!val) {
      setUrlError("Vui lòng nhập hoặc dán link YouTube!");
      return;
    }

    const videoId = extractYouTubeId(val);
    if (!videoId) {
      setUrlError("Link YouTube không hợp lệ! Hỗ trợ dạng: youtube.com/watch?v=..., youtu.be/..., shorts/...");
      return;
    }

    try {
      setIsResolvingUrl(true);
      setUrlError("");
      const info = await fetchYouTubeOEmbed(videoId);
      setUrlPreview(info);
    } catch (err) {
      setUrlError("Không thể lấy thông tin video.");
    } finally {
      setIsResolvingUrl(false);
    }
  };

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrlInput(val);
    setUrlError("");
    const videoId = extractYouTubeId(val);
    if (videoId) {
      resolveUrl(val);
    }
  };

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    resolveUrl(urlInput);
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setUrlInput(text);
          resolveUrl(text);
        }
      }
    } catch (err) {
      console.warn("Clipboard access denied or not supported:", err);
    }
  };

  const handleAdd = async (item) => {
    await onAddToQueue({
      videoId: item.videoId,
      title: item.title,
      thumbnail: item.thumbnail,
      addedBy: user?.displayName || "Khách",
      addedByUid: user?.uid || "anon"
    });
    setAddedId(item.videoId);
    setTimeout(() => setAddedId(null), 1500);
    // clear URL preview if added from url tab
    if (activeTab === "url") {
      setUrlInput("");
      setUrlPreview(null);
    }
  };

  const handleDirectPlay = async (item) => {
    if (!isHost) return;
    await onPlayNow({
      videoId: item.videoId,
      title: item.title,
      thumbnail: item.thumbnail
    });
    if (activeTab === "url") {
      setUrlInput("");
      setUrlPreview(null);
    }
  };

  return (
    <div className={`${onBack ? "mobile-search-screen" : ""} bg-slate-900/90 border border-slate-800 rounded-2xl md:rounded-3xl p-3 md:p-5 flex flex-col h-full shadow-xl overflow-hidden`}>
      {onBack && <button onClick={onBack} className="mobile-search-back hidden items-center gap-2 text-white font-semibold py-2"><span aria-hidden="true">←</span> Tìm kiếm</button>}
      {/* Tab Switcher */}
      <div className="flex bg-slate-950 p-1 rounded-xl mb-3 border border-slate-800 flex-shrink-0">
        <button
          onClick={() => setActiveTab("search")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === "search"
              ? "bg-slate-800 text-white shadow-md border border-slate-700/60"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Tìm kiếm bài hát</span>
        </button>

        <button
          onClick={() => setActiveTab("url")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition ${
            activeTab === "url"
              ? "bg-slate-800 text-white shadow-md border border-slate-700/60"
              : "text-slate-400 hover:text-white"
          }`}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          <span>Dán Link YouTube</span>
        </button>
      </div>

      {/* Tab 1: Search */}
      {activeTab === "search" && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <form onSubmit={handleSearch} className="mb-2.5 flex-shrink-0 relative">
            <div className="relative">
              <input
                type="text"
                placeholder="Tên bài hát... hoặc dán link YouTube"
                value={searchQuery}
                onChange={(e) => { setSuggestionsDismissed(false); setSearchQuery(e.target.value); }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3 pr-20 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition disabled:opacity-40"
              >
                {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={toggleVoiceSearch}
                disabled={isSearching}
                aria-label={isListening ? "Dừng tìm kiếm bằng giọng nói" : "Tìm kiếm bằng giọng nói"}
                title={isListening ? "Dừng nghe" : "Tìm kiếm bằng giọng nói"}
                className={`absolute right-10 top-1/2 -translate-y-1/2 p-2 rounded-lg transition disabled:opacity-40 ${isListening ? "text-red-400 animate-pulse" : "text-slate-400 hover:text-white"}`}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>

          {suggestions.length > 0 && !isSearching && !suggestionsDismissed && (
            <div className="-mt-2 mb-2 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex-shrink-0">
              {suggestions.map((song) => (
                <button key={song.videoId} type="button" onClick={() => { setQuerySuggestions([]); setSuggestionError(""); setSearchQuery(song.title); handleSearch(null, song.title); }} className="w-full flex items-center gap-2 p-2 text-left hover:bg-slate-800">
                  <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-white truncate">{song.title}</span>
                  <span className="ml-auto text-[10px] text-slate-500">Gần đây</span>
                </button>
              ))}
            </div>
          )}

          {isLoadingSuggestions && searchQuery.trim().length >= 2 && !isSearching && (
            <p className="-mt-2 mb-2 px-2 text-[11px] text-slate-500">Đang tải gợi ý...</p>
          )}
          {suggestionError && !isSearching && (
            <p className="-mt-2 mb-2 px-2 text-[11px] text-slate-500">{suggestionError}</p>
          )}

          {searchError && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 mb-2 flex items-start gap-2 flex-shrink-0">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{searchError}</p>
                {searchError.includes("YouTube API Key") && (
                  <button
                    onClick={onOpenConfig}
                    className="text-red-400 underline font-semibold mt-1 block"
                  >
                    Bấm vào đây để cài đặt YouTube API Key
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Results List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 md:space-y-2 pr-0.5 md:pr-1 min-h-0">
            {searchResults.length === 0 && !isSearching && !searchError && (
              <div className="text-center py-6 text-slate-500 text-xs">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30 text-red-400" />
                <span>Nhập tên bài hát hoặc dán link YouTube</span>
              </div>
            )}

            {searchResults.map((item) => {
              const isJustAdded = addedId === item.videoId;
              return (
                <div
                  key={item.videoId}
                  className="flex items-center gap-2 p-2 md:gap-2.5 md:p-2 bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800/80 rounded-xl transition mobile-video-result"
                >
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-16 h-11 md:w-14 md:h-9 object-cover rounded-lg flex-shrink-0 bg-slate-900 border border-slate-800"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[13px] leading-5 md:text-xs md:leading-normal font-semibold text-white line-clamp-2 md:truncate break-words" title={item.title}>
                      {item.title}
                    </h4>
                    <p className="text-xs md:text-[10px] text-slate-400 truncate mt-0.5 md:mt-0">{item.channelTitle || item.authorName}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isHost && (
                      <button
                        onClick={() => handleDirectPlay(item)}
                        title="Phát ngay lập tức"
                        className="w-9 h-9 md:w-auto md:h-auto p-0 md:p-1.5 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl shadow-sm active:scale-95 transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    )}
                    <button
                      onClick={() => handleAdd(item)}
                      title="Thêm vào danh sách chờ"
                        className={`w-9 h-9 md:w-auto md:h-auto p-0 md:p-1.5 flex items-center justify-center rounded-xl shadow-sm active:scale-95 transition ${
                        isJustAdded
                          ? "bg-emerald-500 text-white"
                          : "bg-red-500 hover:bg-red-600 text-white"
                      }`}
                    >
                      {isJustAdded ? <Check className="w-4 h-4 md:w-3.5 md:h-3.5" /> : <Plus className="w-4 h-4 md:w-3.5 md:h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Direct URL Paste */}
      {activeTab === "url" && (
        <div className="flex-1 flex flex-col overflow-y-auto pr-1 min-h-0 space-y-3">
          <form onSubmit={handleUrlSubmit} className="flex-shrink-0">
            <div className="relative">
              <input
                type="text"
                placeholder="Dán link (VD: youtube.com/watch?v=... hoặc youtu.be/...)"
                value={urlInput}
                onChange={handleUrlChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-3 pr-24 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  title="Dán từ Clipboard"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition text-[10px]"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-red-400" />
                </button>
                <button
                  type="submit"
                  disabled={isResolvingUrl || !urlInput.trim()}
                  className="px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition disabled:opacity-40 flex items-center gap-1"
                >
                  {isResolvingUrl ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>Tìm</span>
                      <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {urlError && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex-shrink-0">
              {urlError}
            </div>
          )}

          {/* Compact, Beautiful Preview Card that is NEVER clipped or covered */}
          {urlPreview ? (
            <div className="p-3 bg-slate-950 border border-red-500/40 rounded-2xl space-y-3 animate-fade-in shadow-xl flex-shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={urlPreview.thumbnail}
                  alt={urlPreview.title}
                  className="w-24 h-16 rounded-xl object-cover flex-shrink-0 bg-slate-900 border border-slate-800 shadow-md"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-white line-clamp-2" title={urlPreview.title}>
                    {urlPreview.title}
                  </h4>
                  <p className="text-[10px] text-red-400 font-medium mt-1 truncate">
                    {urlPreview.authorName || "YouTube"}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Prominent and never covered */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleAdd(urlPreview)}
                  className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 active:scale-95 text-white text-xs font-bold py-2.5 px-3 rounded-xl shadow-lg shadow-red-500/25 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Vào danh sách</span>
                </button>

                {isHost && (
                  <button
                    type="button"
                    onClick={() => handleDirectPlay(urlPreview)}
                    className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-slate-950 text-xs font-bold py-2.5 px-3 rounded-xl shadow-lg shadow-amber-500/25 transition"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Phát ngay</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 text-center py-4">
              💡 Dán bất kỳ link YouTube nào vào đây để nạp bài mà không tốn quota API.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
