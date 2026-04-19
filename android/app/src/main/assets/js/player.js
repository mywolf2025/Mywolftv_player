(function () {
  'use strict';

  class MWPlayer {
    constructor(videoEl) {
      this.video = videoEl;
      this.hls = null;
    }

    destroy() {
      if (this.hls) {
        try { this.hls.destroy(); } catch (e) {}
        this.hls = null;
      }
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }

    play(url, opts = {}) {
      this.destroy();
      const isHls = /\.m3u8(\?.*)?$/i.test(url) || opts.forceHls;

      if (isHls && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
          maxBufferLength: 30,
          enableWorker: true,
          lowLatencyMode: false,
        });
        this.hls = hls;
        hls.loadSource(url);
        hls.attachMedia(this.video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          this.video.play().catch(() => {});
        });
        hls.on(window.Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                this.destroy();
                if (opts.onError) opts.onError(data);
            }
          }
        });
      } else if (isHls && this.video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        this.video.src = url;
        this.video.play().catch(() => {});
      } else {
        this.video.src = url;
        this.video.play().catch(() => {});
      }
    }
  }

  window.MWPlayer = MWPlayer;
})();
