export interface ArtistSummary {
  id?: string;
  name: string;
  thumbnailUrl?: string;
}

export interface Artist {
  id: string;
  name: string;

  description?: string;
  subscriberCount?: string;
  monthlyListeners?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;

  source: 'youtube';
}

export type SerializedArtist = Pick<Artist, 'id' | 'name' | 'thumbnailUrl'>;
