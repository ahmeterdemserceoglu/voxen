/** Raw types from YouTube Music InnerTube responses — never used directly in UI */

export interface YTMRun {
  text: string;
  navigationEndpoint?: {
    watchEndpoint?: { videoId: string };
    browseEndpoint?: { browseId: string; pageType?: string };
  };
}

export interface YTMThumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface YTMThumbnailRenderer {
  thumbnail: { thumbnails: YTMThumbnail[] };
}

export interface YTMFlexColumn {
  musicResponsiveListItemFlexColumnRenderer?: {
    text?: { runs?: YTMRun[] };
  };
}

export interface YTMListItemRenderer {
  flexColumns?: YTMFlexColumn[];
  thumbnail?: { musicThumbnailRenderer?: YTMThumbnailRenderer };
  playlistItemData?: { videoId: string };
  navigationEndpoint?: { watchEndpoint?: { videoId: string } };
  overlay?: unknown;
}

export interface YTMShelfRenderer {
  title?: { runs?: YTMRun[] };
  contents?: Array<{ musicResponsiveListItemRenderer?: YTMListItemRenderer }>;
}

export interface YTMSearchResponse {
  contents?: {
    tabbedSearchResultsRenderer?: {
      tabs?: Array<{
        tabRenderer?: {
          content?: {
            sectionListRenderer?: { contents?: Array<{ musicShelfRenderer?: YTMShelfRenderer }> };
          };
        };
      }>;
    };
    sectionListRenderer?: { contents?: Array<{ musicShelfRenderer?: YTMShelfRenderer }> };
  };
}

export interface PipedStream {
  url: string;
  bitrate?: number;
  mimeType?: string;
  quality?: string;
}

export interface PipedStreamsResponse {
  audioStreams?: PipedStream[];
  videoStreams?: PipedStream[];
  title?: string;
  uploader?: string;
  thumbnailUrl?: string;
  duration?: number;
}

export interface PipedSearchItem {
  url?: string;
  id?: string;
  title: string;
  uploaderName?: string;
  thumbnail?: string;
  duration?: number;
  type?: string;
}

export interface PipedSearchResponse {
  items?: PipedSearchItem[];
}
