// Approved Orbis Stable footage, assembled offline in HyperFrames.
// Serving these files never opens a provider session or spends generation credits.
export const welcomeMedia: {
  poster: string;
  mobilePoster?: string;
  intro: { desktop: string; mobile: string } | null;
  ambient: { desktop: string; mobile: string } | null;
} = {
  poster: "/media/welcome/poster-desktop.jpg",
  mobilePoster: "/media/welcome/poster-mobile.jpg",
  intro: {
    desktop: "/media/welcome/intro-desktop.mp4",
    mobile: "/media/welcome/intro-mobile.mp4",
  },
  ambient: {
    desktop: "/media/welcome/ambient-desktop.mp4",
    mobile: "/media/welcome/ambient-mobile.mp4",
  },
};
