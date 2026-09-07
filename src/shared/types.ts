export interface TwitCastingUser {
  id: string;
  screen_id: string;
  name: string;
  image: string;
  profile?: string;
  level?: number;
  last_movie_id?: string | null;
  is_live?: boolean;
}

export interface TwitCastingMovie {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  link: string;
  is_live: boolean;
  is_recorded: boolean;
  comment_count: number;
  large_thumbnail: string;
  small_thumbnail: string;
  duration: number;
  created: number;
  current_view_count: number;
  total_view_count: number;
  hls_url: string | null;
  is_protected?: boolean;
  is_membership?: boolean;
  is_premier?: boolean;
}

export interface TwitCastingComment {
  id: string;
  message: string;
  from_user: TwitCastingUser;
  created: number;
}

export interface TrackedUser {
  userId: string;
  screenId: string;
  name: string;
  image: string;
  addedAt: number;
  lastUsedAt: number;
}

export interface StoredComment {
  commentId: string;
  movieId: string;
  userId: string;
  screenId: string;
  name: string;
  image: string;
  message: string;
  createdAt: number;
  receivedAt: number;
}

export interface StreamMetric {
  capturedAt: number;
  currentViewers: number;
  totalViewers: number;
  totalComments: number;
  commentsPerMinute: number;
  uniqueCommenters: number;
  viewerDelta: number;
  momentum: number;
  activityScore: number;
}

export interface StreamSession {
  movieId: string;
  userId: string;
  title: string;
  link: string;
  startedAt: number;
  endedAt: number | null;
  currentViewers: number;
  totalViewers: number;
  totalComments: number;
}

export interface TrackerStatus {
  trackedUserId: string | null;
  isRunning: boolean;
  isLive: boolean;
  activeMovieId: string | null;
  lastCheckedAt: number | null;
  error: string | null;
}

export interface AuthStatus {
  connected: boolean;
  account: TwitCastingUser | null;
  callbackUrl: string;
  secureStorageAvailable: boolean;
  appClientConfigured: boolean;
}

export interface CommentAuthStatus {
  connected: boolean;
  account: TwitCastingUser | null;
  secureStorageAvailable: boolean;
}

export interface PostCommentResult {
  movieId: string;
  allCount: number;
  comment: StoredComment | null;
}

export interface DashboardPayload {
  auth: AuthStatus;
  tracker: TrackerStatus;
  selectedUser: TrackedUser | null;
  liveMovie: TwitCastingMovie | null;
  metrics: StreamMetric[];
  comments: StoredComment[];
}

export interface TrackerUpdate {
  tracker: TrackerStatus;
  trackedUser: TrackedUser | null;
  liveMovie: TwitCastingMovie | null;
  latestMetric: StreamMetric | null;
  newComments: StoredComment[];
}

export type TerminalKind = 'system' | 'live' | 'wait' | 'comment' | 'pulse' | 'warning' | 'error';

export interface TerminalEvent {
  id: string;
  at: number;
  kind: TerminalKind;
  label: string;
  message: string;
  detail?: string;
}

export interface StartTrackingResult {
  dashboard: DashboardPayload;
  target: TrackedUser;
}

export interface CaspulseApi {
  getBootstrap: () => Promise<DashboardPayload>;
  getRelayStatus: () => Promise<{ ok: boolean; baseUrl: string }>;
  getCommentAuthStatus: () => Promise<CommentAuthStatus>;
  connectCommentAuth: () => Promise<CommentAuthStatus>;
  disconnectCommentAuth: () => Promise<CommentAuthStatus>;
  postComment: (movieId: string, comment: string) => Promise<PostCommentResult>;
  startTrackingInput: (input: string) => Promise<StartTrackingResult>;
  stopTracking: () => Promise<TrackerStatus>;
  getDashboard: (userId?: string) => Promise<DashboardPayload>;
  getLiveThumbnail: (userId: string) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  onTrackerUpdate: (listener: (update: TrackerUpdate) => void) => () => void;
  onTerminalEvent: (listener: (event: TerminalEvent) => void) => () => void;
}
