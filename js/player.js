(function () {
  'use strict';

  class MWPlayer {
    constructor(videoEl) {
      this.video = videoEl;
      this.hls = null;
      this._listeners = [];
    }

    on(evt, fn) { this._listeners.push({ evt, fn }); }
    _emit(evt, payload) {
      this._listeners.filter(l => l.evt === evt).forEach(l => { try { l.fn(payload); } catch (e) {} });
    }

    destroy() {
      if (this.hls) {
        try { this.hls.destroy(); } catch (e) {}
        this.hls = null;
      }
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this._listeners = [];
    }

    play(url, opts = {}) {
      this.destroy();
      const isHls = /\.m3u8(\?.*)?$/i.test(url) || opts.forceHls;

      if (isHls && window.Hls && window.Hls.isSupported()) {
        const settings = (window.MWStorage && MWStorage.getSettings()) || {};
        const bufferLen = Number(settings.bufferLen) || 30;
        const hls = new window.Hls({
          maxBufferLength: bufferLen,
          enableWorker: true,
          lowLatencyMode: false,
        });
        this.hls = hls;
        hls.loadSource(url);
        hls.attachMedia(this.video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          this.video.play().catch(() => {});
          this._emit('tracks', this.tracks());
        });
        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, () => this._emit('tracks', this.tracks()));
        hls.on(window.Hls.Events.SUBTITLE_TRACKS_UPDATED, () => this._emit('tracks', this.tracks()));
        hls.on(window.Hls.Events.LEVEL_SWITCHED, () => this._emit('tracks', this.tracks()));
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
        this.video.src = url;
        this.video.play().catch(() => {});
        this.video.addEventListener('loadedmetadata', () => this._emit('tracks', this.tracks()), { once: true });
      } else {
        this.video.src = url;
        this.video.play().catch(() => {});
        this.video.addEventListener('loadedmetadata', () => this._emit('tracks', this.tracks()), { once: true });
      }
    }

    tracks() {
      const out = { audio: [], subtitle: [], quality: [] };
      if (this.hls) {
        out.audio = (this.hls.audioTracks || []).map((t, i) => ({
          id: i, name: t.name || t.lang || ('Audio ' + (i + 1)), active: i === this.hls.audioTrack,
        }));
        out.subtitle = (this.hls.subtitleTracks || []).map((t, i) => ({
          id: i, name: t.name || t.lang || ('Subtitle ' + (i + 1)), active: i === this.hls.subtitleTrack,
        }));
        out.subtitle.unshift({ id: -1, name: 'Off', active: this.hls.subtitleTrack === -1 });
        out.quality = (this.hls.levels || []).map((lv, i) => ({
          id: i,
          name: lv.height ? (lv.height + 'p' + (lv.bitrate ? ' · ' + Math.round(lv.bitrate / 1000) + 'k' : '')) : ('Level ' + (i + 1)),
          active: i === this.hls.currentLevel,
        }));
        out.quality.unshift({ id: -1, name: 'Auto', active: this.hls.currentLevel === -1 });
      } else if (this.video) {
        const tt = this.video.textTracks;
        if (tt) {
          for (let i = 0; i < tt.length; i++) {
            out.subtitle.push({ id: i, name: tt[i].label || tt[i].language || ('Subtitle ' + (i + 1)), active: tt[i].mode === 'showing' });
          }
          if (out.subtitle.length) out.subtitle.unshift({ id: -1, name: 'Off', active: !out.subtitle.some(s => s.active) });
        }
      }
      return out;
    }

    setAudioTrack(id) {
      if (this.hls && id >= 0) this.hls.audioTrack = id;
    }
    setSubtitleTrack(id) {
      if (this.hls) {
        this.hls.subtitleTrack = id;
      } else if (this.video && this.video.textTracks) {
        const tt = this.video.textTracks;
        for (let i = 0; i < tt.length; i++) tt[i].mode = (i === id) ? 'showing' : 'disabled';
      }
    }
    setQuality(id) {
      if (this.hls) this.hls.currentLevel = id;
    }
    setPlaybackRate(r) {
      this.video.playbackRate = Number(r) || 1;
    }
  }

  window.MWPlayer = MWPlayer;
})();
