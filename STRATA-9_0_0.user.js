// ==UserScript==
// @name         STRATA
// @namespace    strata
// @version      9.0.0
// @description  STRATA — a curated electronic music radio for YouTube, playing from hand-picked electronic music channels, with release info, track analysis and audio-reactive visuals.
// @match        https://www.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      bandcamp.com
// @connect      *.bandcamp.com
// @connect      soundcloud.com
// @connect      www.soundcloud.com
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/colman909/strata-seed
// @updateURL    https://raw.githubusercontent.com/colman909/strata-seed/main/STRATA.user.js
// @downloadURL  https://raw.githubusercontent.com/colman909/strata-seed/main/STRATA.user.js
// ==/UserScript==

(function () {
    'use strict';

    const STRATA_VERSION =
        '9.0.0';

    /*
        v9.0.0 RELEASE
        STRATA (no longer "STRATA Beta"): new script name and namespace,
        update address STRATA.user.js. On first run it imports favourites,
        settings, history and analysis handed over by the final Beta build
        (8.6.5) through YouTube's page storage, then deletes the hand-over.

        v8.6.4: About panel support uses a PayPal.Me link button
        (paypal.me/COLMANBUCKLEY) instead of the old QR code, which
        PayPal no longer recognised.

        v8.6.3: 808 skin set to the "Night" look chosen in the 808 skin lab:
        near-black body, dark transport keys with red / orange / yellow
        symbols, yellow accent, label tabs, 16-step key row.

        v8.6.2: 909 skin set to the "Contrast" look chosen in the 909 skin
        lab: deeper charcoal, strong slate cards, punchier orange, orange
        section labels, light-grey keys.

        v8.6.1: 909 skin rebuilt from the machine's own palette.

        v8.6.0 INK BLACK + DRUM MACHINE SKINS
        New INK BLACK skin (dark UI, white accent) is the default for new
        installs; existing users keep the skin they have. Two new skins
        after the classic drum machines: 808 (warm orange, with the
        red / orange / yellow / cream step-key row under the header) and
        909 (the machine's own palette: charcoal body, slate-blue cards,
        orange label bars, light-grey START/STOP-style keys).
        Welcome card and notices use the ink palette. Prism Cycle now
        drifts through white once per loop.
    */

    /*
        v8.5.99 AUTOPLAY BLOCKED NOTICE
        Firefox (by default) refuses to start sound on a page the user
        has not clicked, and STRATA loads a fresh page per track, so the
        radio silently stalled there. STRATA now detects the refusal,
        explains it, resumes on the next click anywhere, and tells the
        user how to allow autoplay for YouTube once so it never recurs.
        Also: Bandcamp text decoding now uses DOMParser (same as the
        store builds).
    */

    /*
        v8.5.98: the v2 analysis engine is the only engine. The classic
        engine and the NEW / CLASSIC Settings switch are removed.

        v8.5.97 TRACK ANALYSIS ENGINE v2
        Kick-band tempo on the media clock with whole-track phase-coherent
        scoring and BPM snapping; harmonic/percussive separation and
        between-kick snapshots before key detection; tuning detection;
        EDM key profiles; provisional key early, full-track result saved
        and refined on replays; honest "No clear key". Per-track analysis
        log in About -> Copy diagnostics.
    */

    /*
        v8.5.94 QUIET CONSOLE

        Inside STRATA, "console" is this wrapper. Everything is kept in a
        rolling buffer (the last 80 lines) for About -> Copy diagnostics,
        but ordinary log/debug chatter only reaches the browser console
        when Debug log is switched on in About. Warnings and errors always
        show.
    */

    const strataRealConsole =
        window.console;

    const STRATA_LOG_BUFFER =
        [];

    const STRATA_DEBUG_LOG_KEY =
        'strata_v8594_debug_logging';

    let strataDebugLogging =
        (() => {
            try {
                return GM_getValue(
                    STRATA_DEBUG_LOG_KEY,
                    false
                ) === true;
            } catch {
                return false;
            }
        })();

    function strataRecordLog(
        level,
        args
    ) {
        try {
            const text =
                args
                    .map(
                        value => {
                            if (
                                value instanceof Error
                            ) {
                                return value.message;
                            }

                            if (
                                value &&
                                typeof value ===
                                    'object'
                            ) {
                                try {
                                    return JSON.stringify(
                                        value
                                    ).slice(
                                        0,
                                        200
                                    );
                                } catch {
                                    return String(
                                        value
                                    );
                                }
                            }

                            return String(
                                value
                            );
                        }
                    )
                    .join(
                        ' '
                    );

            STRATA_LOG_BUFFER.push(
                `${new Date().toISOString().slice(11, 19)} ${level.toUpperCase()} ${text}`.slice(
                    0,
                    400
                )
            );

            if (
                STRATA_LOG_BUFFER.length >
                80
            ) {
                STRATA_LOG_BUFFER.shift();
            }
        } catch {}
    }

    const console = {
        log(...args) {
            strataRecordLog('log', args);

            if (strataDebugLogging) {
                strataRealConsole.log(...args);
            }
        },

        debug(...args) {
            strataRecordLog('debug', args);

            if (strataDebugLogging) {
                strataRealConsole.debug(...args);
            }
        },

        info(...args) {
            strataRecordLog('info', args);

            strataRealConsole.info(...args);
        },

        warn(...args) {
            strataRecordLog('warn', args);

            strataRealConsole.warn(...args);
        },

        error(...args) {
            strataRecordLog('error', args);

            strataRealConsole.error(...args);
        }
    };

    /*
        v8.5.91 instance guard. YouTube hosts its own iframes on
        www.youtube.com (live chat, premieres, some embeds) and @match
        covers them, so without this every live stream ran a second,
        invisible STRATA inside the chat frame: duplicate seed checks,
        duplicate release lookups, duplicate player polling. @noframes
        handles it in Tampermonkey; this covers managers that ignore it,
        plus an accidental double install of the script.
    */

    try {
        if (
            window.top !==
            window.self
        ) {
            return;
        }
    } catch {
        return;
    }

    /*
        v9.0.0 RELEASE HAND-OVER
        Tell the Beta script the release is installed (it then steps
        aside), and import whatever the final Beta handed over: on the
        first run only, never overwriting anything this script already
        has. Runs before any setting is read.
    */
    try {
        localStorage.setItem(
            'strata_release_present',
            String( Date.now() )
        );
    } catch {}

    try {
        if ( !GM_getValue( 'strata_release_imported', false ) ) {
            const raw =
                localStorage.getItem(
                    'strata_beta_handover'
                );

            const handover =
                raw
                    ? JSON.parse( raw )
                    : null;

            let imported = 0;

            if ( handover && handover.v === 1 && handover.data ) {
                for ( const [ key, value ] of Object.entries( handover.data ) ) {
                    if (
                        /^(strata_|deeptube_)/.test( key ) &&
                        GM_getValue( key, undefined ) === undefined
                    ) {
                        GM_setValue( key, value );
                        imported++;
                    }
                }

                localStorage.removeItem(
                    'strata_beta_handover'
                );
            }

            GM_setValue(
                'strata_release_imported',
                { at: Date.now(), keys: imported }
            );

            if ( imported ) {
                strataRealConsole.info(
                    `[STRATA] imported ${imported} setting(s) from STRATA Beta`
                );
            }
        } else {
            // Already imported: don't leave Beta's copy lying in YouTube's storage.
            localStorage.removeItem(
                'strata_beta_handover'
            );
        }
    } catch ( error ) {
        strataRealConsole.warn(
            '[STRATA] Beta hand-over import skipped',
            error
        );
    }

    if (
        document.documentElement
            ?.dataset
            ?.strataInstance
    ) {
        console.warn(
            '[STRATA] another STRATA instance is already running on this page — this copy is standing down'
        );

        return;
    }

    if (
        document.documentElement
    ) {
        document.documentElement.dataset.strataInstance =
            STRATA_VERSION;
    }

    console.info(`[STRATA] ${STRATA_VERSION}`);

    // ============================================================
    // TRUSTED TYPES (v8.5.80)
    //
    // YouTube enforces Trusted Types in Chromium browsers (Edge/Chrome).
    // Under enforcement, DOMParser.parseFromString() and .innerHTML
    // reject plain strings. That made Bandcamp release parsing return
    // null and profile icons fail to render on Edge while Firefox worked.
    // Strings are routed through a private passthrough policy when one
    // can be created; parsing also has a regex fallback that needs no DOM.
    // ============================================================

    const strataTrustedPolicy =
        (() => {
            try {
                if (
                    window.trustedTypes &&
                    typeof window.trustedTypes.createPolicy ===
                        'function'
                ) {
                    return window.trustedTypes.createPolicy(
                        'strata-html',
                        {
                            createHTML:
                                value =>
                                    value
                        }
                    );
                }
            } catch (error) {
                console.debug(
                    '[STRATA] Trusted Types policy unavailable',
                    error
                );
            }

            return null;
        })();

    function strataTrustedHTML(
        value
    ) {
        const text =
            String(
                value ??
                ''
            );

        return strataTrustedPolicy
            ? strataTrustedPolicy.createHTML(
                text
            )
            : text;
    }

    function strataParseHTML(
        value
    ) {
        return new DOMParser()
            .parseFromString(
                strataTrustedHTML(
                    value
                ),
                'text/html'
            );
    }

    function strataDecodeEntities(
        value
    ) {
        const fromCode =
            (
                match,
                code
            ) => {
                try {
                    return Number.isFinite(
                        code
                    )
                        ? String.fromCodePoint(
                            code
                        )
                        : match;
                } catch {
                    return match;
                }
            };

        return String(
            value ||
            ''
        )
            .replace(
                /&#x([0-9a-f]+);/gi,
                (
                    match,
                    hex
                ) =>
                    fromCode(
                        match,
                        parseInt(
                            hex,
                            16
                        )
                    )
            )
            .replace(
                /&#(\d+);/g,
                (
                    match,
                    dec
                ) =>
                    fromCode(
                        match,
                        parseInt(
                            dec,
                            10
                        )
                    )
            )
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&');
    }

    // ============================================================
    // DEFAULT CHANNELS
    // ============================================================

    const DEFAULT_CHANNELS = [
        '@Acidalia',
        '@AnalogueNetwork',
        '@IndefinitePitch',
        '@MNMT',
        '@subsuelorecs',
        '@PARADIGMAS-jl2so'
    ];

    // ============================================================
    // STORAGE
    //
    // IMPORTANT:
    // Keep the old keys so the existing STRATA library survives.
    // ============================================================

    const CACHE_KEY =
        'deeptube_v7_bucket_cache';

    const CHANNEL_SETTINGS_KEY =
        'deeptube_v71_channel_settings';

    const SESSION_SEEN_KEY =
        'deeptube_v7_session_seen';

    const SESSION_LAST_CHANNEL_KEY =
        'deeptube_v7_last_channel';

    const SESSION_HISTORY_KEY =
        'deeptube_v7_history';

    /*
        v8.5.86 FAVOURITES BACKUP

        Tampermonkey storage belongs to one installed script. Installing a
        build as a separate script (or deleting the old one first) starts
        with empty storage, which wiped favourites. Favourites are now also
        mirrored to youtube.com's localStorage, which is shared by every
        STRATA install in this browser. An empty install restores from it.
    */

    const FAVOURITES_BACKUP_KEY =
        'strata_favourites_backup_v1';

    function readFavouritesBackup() {
        try {
            const raw =
                window.localStorage.getItem(
                    FAVOURITES_BACKUP_KEY
                );

            const parsed =
                raw
                    ? JSON.parse(
                        raw
                    )
                    : null;

            return parsed &&
                typeof parsed ===
                    'object' &&
                !Array.isArray(
                    parsed
                )
                ? parsed
                : null;

        } catch {
            return null;
        }
    }

    function writeFavouritesBackup(
        value
    ) {
        try {
            window.localStorage.setItem(
                FAVOURITES_BACKUP_KEY,
                JSON.stringify(
                    value ||
                    {}
                )
            );

        } catch {}
    }

    function restoreFavouritesFromBackup(
        stored
    ) {
        const current =
            stored &&
            typeof stored ===
                'object' &&
            !Array.isArray(
                stored
            )
                ? stored
                : {};

        const backup =
            readFavouritesBackup();

        if (
            !Object.keys(
                current
            ).length &&
            backup &&
            Object.keys(
                backup
            ).length
        ) {
            GM_setValue(
                FAVOURITES_KEY,
                backup
            );

            console.log(
                `[STRATA] Restored ${Object.keys(backup).length} favourites from backup`
            );

            return backup;
        }

        // Make sure a backup exists for the next install.
        writeFavouritesBackup(
            current
        );

        return current;
    }

    function saveFavourites() {
        GM_setValue(
            FAVOURITES_KEY,
            favourites
        );

        writeFavouritesBackup(
            favourites
        );
    }

    const FAVOURITES_KEY =
        'strata_v8_favourites';

    const RADIO_KEY =
        'strata_v8_radio';

    const STATS_OPEN_KEY =
        'strata_v8_stats_open';

    const SKIN_KEY =
        'strata_v8539_skin';

    const VISUALIZER_ENABLED_KEY =
        'strata_v8546_visualizer_enabled';

    const VISUALIZER_STYLE_KEY =
        'strata_v8547_visualizer_style';

    const VISUALIZER_REACTIVITY_KEY =
        'strata_v8547_visualizer_reactivity';

    const VISUALIZER_ACTIVE_STYLES_KEY =
        'strata_v8554_visualizer_active_styles';

    const LINK_CACHE_SESSION_KEY =
        'strata_v8532_link_cache';

    /*
        Resolved SoundCloud artist profiles.

        Keyed by a normalized artist name so STRATA does not repeat a
        SoundCloud People search for the same artist on every track.
        This cache is completely separate from the YouTube music cache.
    */

    const SOUNDCLOUD_ARTIST_CACHE_KEY =
        'strata_v8523_soundcloud_artist_profiles';

    const PREFETCH_KEY =
        'strata_v852_prefetch';

    const RECENT_CHANNELS_KEY =
        'strata_v852_recent_channels';

    /*
        The ONLY position we persist now.

        This is the mini player's home position.
    */

    const MINI_ANCHOR_KEY =
        'strata_v852_mini_anchor';


    // ============================================================
    // UI SKINS
    // ============================================================

    /*
        These are deliberately colour skins rather than separate layouts.
        Every skin uses the same protected STRATA UI/geometry and swaps only
        the accent system, so changing skin cannot disturb playback,
        positioning, resizing or panel behaviour.
    */

    const SKIN_OPTIONS = [
        {
            id:
                'black',
            label:
                'INK BLACK',
            swatch:
                '#111111'
        },
        {
            id:
                '808',
            label:
                '808',
            swatch:
                'linear-gradient(90deg, #0f0e0d 0 40%, #e5402f 40% 60%, #f5821f 60% 80%, #f7c51e 80% 100%)'
        },
        {
            id:
                '909',
            label:
                '909',
            swatch:
                'linear-gradient(90deg, #34373f 0 34%, #e9e6e5 34% 67%, #ff8a3d 67% 100%)'
        },
        {
            id:
                'cyan',

            label:
                'NEON CYAN',

            swatch:
                '#00f2ff'
        },
        {
            id:
                'violet',

            label:
                'ULTRA VIOLET',

            swatch:
                '#9b5cff'
        },
        {
            id:
                'lime',

            label:
                'ACID LIME',

            swatch:
                '#b7ff00'
        },
        {
            id:
                'magenta',

            label:
                'HOT MAGENTA',

            swatch:
                '#ff2bd6'
        },
        {
            id:
                'amber',

            label:
                'SIGNAL AMBER',

            swatch:
                '#ff9800'
        },
        {
            id:
                'red',

            label:
                'LASER RED',

            swatch:
                '#ff3b4f'
        },
        {
            id:
                'blue',

            label:
                'ELECTRIC BLUE',

            swatch:
                '#3d7bff'
        },
        {
            id:
                'mint',

            label:
                'VAPOR MINT',

            swatch:
                '#2dffc4'
        },
        {
            id:
                'cycle',

            label:
                'PRISM CYCLE',

            swatch:
                'conic-gradient(#ff2bd6, #9b5cff, #00f2ff, #2dffc4, #b7ff00, #ff9800, #ff2bd6)'
        }
    ];

    function normalizeSkinId(
        value
    ) {
        const requested =
            String(
                value ||
                ''
            ).toLowerCase();

        return SKIN_OPTIONS.some(
            option =>
                option.id ===
                requested
        )
            ? requested
            : 'black';
    }

    /*
        v8.6.0: Ink Black is the default for NEW installs. Someone who
        already used STRATA but never picked a skin was on Prism Cycle;
        keep them there (and save it) rather than switching their look.
    */
    function initialSkinId() {
        const saved =
            GM_getValue(
                SKIN_KEY,
                null
            );

        if ( saved ) {
            return normalizeSkinId( saved );
        }

        let existingUser = false;

        try {
            existingUser = Boolean(
                GM_getValue( 'strata_v8594_first_run_tips', null ) ||
                GM_getValue( 'strata_v8_favourites', null ) ||
                GM_getValue( 'deeptube_v7_bucket_cache', null )
            );
        } catch {}

        const initial =
            existingUser
                ? 'cycle'
                : 'black';

        try {
            GM_setValue( SKIN_KEY, initial );
        } catch {}

        return initial;
    }

    let currentSkin =
        normalizeSkinId(
            initialSkinId()
        );

    const VISUALIZER_STYLES = [
        {
            id:
                'vector',

            label:
                'VECTOR',

            description:
                'Pure phosphor oscilloscope'
        },
        {
            id:
                'spectrum',

            label:
                'SPECTRUM',

            description:
                'Log-frequency energy columns'
        },
        {
            id:
                'cascade',

            label:
                'CASCADE',

            description:
                'Spectral waterfall history'
        },
        {
            id:
                'orbit',

            label:
                'ORBIT',

            description:
                'Radial frequency instrument'
        },
        {
            id:
                'phase',

            label:
                'PHASE',

            description:
                'Lissajous phase constellation'
        },
        {
            id:
                'aether',

            label:
                'AETHER',

            description:
                'Ether that becomes a wormhole and a half-seen face'
        }
    ];

    const VISUALIZER_REACTIVITY = {
        low: {
            label:
                'LOW',

            gain:
                0.82,

            attack:
                0.26,

            release:
                0.08,

            transient:
                1.6
        },

        balanced: {
            label:
                'BALANCED',

            gain:
                1.12,

            attack:
                0.42,

            release:
                0.105,

            transient:
                2.2
        },

        high: {
            label:
                'HIGH',

            gain:
                1.48,

            attack:
                0.60,

            release:
                0.14,

            transient:
                3.0
        }
    };

    const VECTOR_LOWER_REACTIVITY = {
        label:
            'LOWER',

        gain:
            0.58,

        attack:
            0.18,

        release:
            0.06,

        transient:
            1.10
    };

    function normalizeVisualizerStyle(
        value
    ) {
        let requested =
            String(
                value ||
                ''
            ).toLowerCase();

        // v8.5.88: Swarm and Ether were replaced by Aether.
        if (
            requested ===
                'swarm' ||
            requested ===
                'ether'
        ) {
            requested =
                'aether';
        }

        return VISUALIZER_STYLES.some(
            style =>
                style.id ===
                requested
        )
            ? requested
            : 'vector';
    }

    function allVisualizerStyleIds() {
        return VISUALIZER_STYLES.map(
            style =>
                style.id
        );
    }

    function normalizeVisualizerActiveStyles(
        value
    ) {
        const valid =
            new Set(
                allVisualizerStyleIds()
            );

        const requested =
            Array.isArray(
                value
            )
                ? value
                : allVisualizerStyleIds();

        const normalized =
            [];

        for (
            const id
            of requested
        ) {
            const clean =
                String(
                    id ||
                    ''
                ).toLowerCase();

            if (
                valid.has(
                    clean
                ) &&
                !normalized.includes(
                    clean
                )
            ) {
                normalized.push(
                    clean
                );
            }
        }

        return normalized.length
            ? normalized
            : allVisualizerStyleIds();
    }

    function activeVisualizerStyles() {
        const enabled =
            new Set(
                visualizerActiveStyles
            );

        return VISUALIZER_STYLES.filter(
            style =>
                enabled.has(
                    style.id
                )
        );
    }

    function isVisualizerStyleActive(
        styleId
    ) {
        return visualizerActiveStyles.includes(
            styleId
        );
    }

    function normalizeVisualizerReactivity(
        value
    ) {
        const requested =
            String(
                value ||
                ''
            ).toLowerCase();

        return Object.prototype.hasOwnProperty.call(
            VISUALIZER_REACTIVITY,
            requested
        )
            ? requested
            : 'balanced';
    }

    let visualizerEnabled =
        Boolean(
            GM_getValue(
                VISUALIZER_ENABLED_KEY,
                true
            )
        );

    let visualizerStyle =
        normalizeVisualizerStyle(
            GM_getValue(
                VISUALIZER_STYLE_KEY,
                'vector'
            )
        );

    let visualizerReactivity =
        normalizeVisualizerReactivity(
            GM_getValue(
                VISUALIZER_REACTIVITY_KEY,
                'balanced'
            )
        );

    let visualizerActiveStyles =
        normalizeVisualizerActiveStyles(
            GM_getValue(
                VISUALIZER_ACTIVE_STYLES_KEY,
                allVisualizerStyleIds()
            )
        );

    if (
        !visualizerActiveStyles.includes(
            visualizerStyle
        )
    ) {
        visualizerActiveStyles.push(
            visualizerStyle
        );
    }

    if (
        !GM_getValue(
            'strata_v888_aether_added',
            false
        )
    ) {
        if (
            !visualizerActiveStyles.includes(
                'aether'
            )
        ) {
            visualizerActiveStyles.push(
                'aether'
            );
        }

        GM_setValue(
            VISUALIZER_ACTIVE_STYLES_KEY,
            visualizerActiveStyles
        );

        GM_setValue(
            'strata_v888_aether_added',
            true
        );
    }

    let visualizerContext =
        null;

    let visualizerSource =
        null;

    let visualizerAnalyser =
        null;

    let visualizerVideo =
        null;

    let visualizerWave =
        null;

    let visualizerSpectrum =
        null;

    let visualizerSpectrumAnalyser =
        null;

    let visualizerSpectrumFloat =
        null;

    let visualizerSpectrumBarPlan =
        null;

    let visualizerSpectrumLevels =
        [];

    let visualizerSpectrumRefDb =
        -30;

    let visualizerSpectrumLastTime =
        0;

    let visualizerSpectrumPeakTime =
        0;

    let visualizerRaf =
        0;

    let visualizerRetryAt =
        0;

    let visualizerMode =
        'TRANSPORT';

    let visualizerLastFrameTime =
        0;

    /*
        FPS cap for the visualizer draw loop. 30fps looks smooth for an audio
        visualizer and roughly halves the render cost versus an uncapped loop,
        which matters a lot on low-spec/integrated-graphics machines. Raise
        toward 16 (~60fps) for stronger machines, or this can later be driven
        by a quality setting.
    */

    const VISUALIZER_MIN_FRAME_MS =
        1000 / 30;

    let visualizerLastRenderTime =
        0;

    let visualizerPreviousRawSub =
        0;

    let visualizerPreviousRawRms =
        0;

    let visualizerPulse =
        0;

    let visualizerPhase =
        0;

    let visualizerMetrics = {
        sub:
            0,

        bass:
            0,

        lowMid:
            0,

        mid:
            0,

        high:
            0,

        air:
            0,

        rms:
            0
    };

    let visualizerPeakBars =
        [];

    let visualizerCascadeHistory =
        [];

    let visualizerCascadeLastCapture =
        0;


    /*
        Ephemeral performance caches.
        These never alter persistent STRATA data or playback ownership.
    */

    const strataDomCache =
        new Map();

    let cachedMainVideoElement =
        null;

    let cachedLocationHref =
        '';

    let cachedLocationVideoId =
        null;

    let visualizerCanvasElement =
        null;

    let visualizerCanvasContext =
        null;

    let visualizerCanvasCssWidth =
        0;

    let visualizerCanvasCssHeight =
        0;

    let visualizerCanvasResizeObserver =
        null;

    let visualizerObservedCanvas =
        null;

    let visualizerBandRanges =
        null;

    const TRACK_ANALYSIS_SAMPLE_MS =
        40;





    const TRACK_ANALYSIS_KEY_MIN_CONFIDENCE =
        0.60;


    const TRACK_ANALYSIS_BPM_MIN_CONFIDENCE =
        0.60;




    const TRACK_ANALYSIS_NOTE_NAMES = [
        'C',
        'C♯',
        'D',
        'E♭',
        'E',
        'F',
        'F♯',
        'G',
        'A♭',
        'A',
        'B♭',
        'B'
    ];



    /*
        Expanded scale/mode family estimates. Major and Minor retain the
        original Krumhansl profiles. Less-common families are conservative:
        they must clearly outperform Major/Minor before being shown.
    */

    const TRACK_ANALYSIS_SCALE_DEFINITIONS = [
        { id: 'major', name: 'Major', short: 'MAJOR', intervals: [0, 2, 4, 5, 7, 9, 11], signature: [4, 11], prior: 0.070, minAdvantage: 0.000 },
        { id: 'minor', name: 'Minor', short: 'MINOR', intervals: [0, 2, 3, 5, 7, 8, 10], signature: [3, 8], prior: 0.070, minAdvantage: 0.000 },
        { id: 'dorian', name: 'Dorian', short: 'DOR', intervals: [0, 2, 3, 5, 7, 9, 10], signature: [3, 9], prior: 0.035, minAdvantage: 0.025 },
        { id: 'phrygian', name: 'Phrygian', short: 'PHR', intervals: [0, 1, 3, 5, 7, 8, 10], signature: [1, 3], prior: 0.035, minAdvantage: 0.025 },
        { id: 'lydian', name: 'Lydian', short: 'LYD', intervals: [0, 2, 4, 6, 7, 9, 11], signature: [4, 6], prior: 0.035, minAdvantage: 0.025 },
        { id: 'mixolydian', name: 'Mixolydian', short: 'MIX', intervals: [0, 2, 4, 5, 7, 9, 10], signature: [4, 10], prior: 0.035, minAdvantage: 0.025 },
        { id: 'locrian', name: 'Locrian', short: 'LOC', intervals: [0, 1, 3, 5, 6, 8, 10], signature: [1, 6], prior: 0.020, minAdvantage: 0.035 },
        { id: 'harmonic-minor', name: 'Harmonic Minor', short: 'HMIN', intervals: [0, 2, 3, 5, 7, 8, 11], signature: [3, 8, 11], prior: 0.025, minAdvantage: 0.035 },
        { id: 'melodic-minor', name: 'Melodic Minor', short: 'MMIN', intervals: [0, 2, 3, 5, 7, 9, 11], signature: [3, 9, 11], prior: 0.025, minAdvantage: 0.035 },
        { id: 'major-pentatonic', name: 'Major Pentatonic', short: 'PMAJ', intervals: [0, 2, 4, 7, 9], signature: [4, 9], prior: 0.015, minAdvantage: 0.035 },
        { id: 'minor-pentatonic', name: 'Minor Pentatonic', short: 'PMIN', intervals: [0, 3, 5, 7, 10], signature: [3, 10], prior: 0.015, minAdvantage: 0.035 },
        { id: 'major-blues', name: 'Major Blues', short: 'BMAJ', intervals: [0, 2, 3, 4, 7, 9], signature: [3, 4], prior: 0.005, minAdvantage: 0.045 },
        { id: 'minor-blues', name: 'Minor Blues', short: 'BMIN', intervals: [0, 3, 5, 6, 7, 10], signature: [3, 6, 10], prior: 0.005, minAdvantage: 0.045 },
        { id: 'diminished', name: 'Diminished', short: 'DIM', intervals: [0, 2, 3, 5, 6, 8, 9, 11], signature: [3, 6, 9], prior: 0.000, minAdvantage: 0.050 },
        { id: 'whole-tone', name: 'Whole Tone', short: 'WHOLE', intervals: [0, 2, 4, 6, 8, 10], signature: [6, 8, 10], prior: 0.000, minAdvantage: 0.050 },
        { id: 'super-locrian', name: 'Super Locrian', short: 'SLOC', intervals: [0, 1, 3, 4, 6, 8, 10], signature: [1, 4, 6, 10], prior: -0.005, minAdvantage: 0.055 },
        { id: 'spanish', name: 'Spanish', short: 'SPAN', intervals: [0, 1, 4, 5, 7, 8, 10], signature: [1, 4, 10], prior: -0.005, minAdvantage: 0.055 },
        { id: 'hungarian-minor', name: 'Hungarian Minor', short: 'HUNG', intervals: [0, 2, 3, 6, 7, 8, 11], signature: [3, 6, 11], prior: -0.005, minAdvantage: 0.055 },
        { id: 'bhairav', name: 'Bhairav', short: 'BHRV', intervals: [0, 1, 4, 5, 7, 8, 11], signature: [1, 4, 8, 11], prior: -0.010, minAdvantage: 0.055 },
        { id: 'hirajoshi', name: 'Hirajoshi', short: 'HIRO', intervals: [0, 2, 3, 7, 8], signature: [2, 3, 8], prior: -0.010, minAdvantage: 0.030 },
        { id: 'in-sen', name: 'In-Sen', short: 'INSEN', intervals: [0, 1, 5, 7, 10], signature: [1, 5, 10], prior: -0.010, minAdvantage: 0.030 },
        { id: 'iwato', name: 'Iwato', short: 'IWATO', intervals: [0, 1, 5, 6, 10], signature: [1, 6, 10], prior: -0.010, minAdvantage: 0.030 },
        { id: 'kumoi', name: 'Kumoi', short: 'KUMOI', intervals: [0, 2, 3, 7, 9], signature: [2, 3, 9], prior: -0.010, minAdvantage: 0.030 },
        { id: 'pelog', name: 'Pelog', short: 'PELOG', intervals: [0, 1, 3, 7, 8], signature: [1, 3, 8], prior: -0.010, minAdvantage: 0.030 }
    ];

    const TRACK_ANALYSIS_CAMELOT_MAJOR = [
        '8B',
        '3B',
        '10B',
        '5B',
        '12B',
        '7B',
        '2B',
        '9B',
        '4B',
        '11B',
        '6B',
        '1B'
    ];

    const TRACK_ANALYSIS_CAMELOT_MINOR = [
        '5A',
        '12A',
        '7A',
        '2A',
        '9A',
        '4A',
        '11A',
        '6A',
        '1A',
        '8A',
        '3A',
        '10A'
    ];

    let trackAnalysisTempoAnalyser =
        null;

    let trackAnalysisKeyAnalyser =
        null;

    let trackAnalysisTempoSpectrum =
        null;

    let trackAnalysisPreviousTempoSpectrum =
        null;

    let trackAnalysisKeySpectrum =
        null;

    let trackAnalysisTempoWeights =
        null;

    let trackAnalysisTempoMaxBin =
        0;


    let trackAnalysisKeyPitchClasses =
        null;

    let trackAnalysisKeyStaticWeights =
        null;

    let trackAnalysisKeyStartBin =
        0;

    let trackAnalysisKeyEndBin =
        -1;

    let trackAnalysisTimer =
        0;

    let trackAnalysisTrackId =
        null;









    let trackAnalysisBpm =
        null;

    let trackAnalysisBpmConfidence =
        0;

    let trackAnalysisKeyIndex =
        null;

    let trackAnalysisScale =
        null;

    let trackAnalysisKeyConfidence =
        0;


    /*
        PRISM CYCLE skin: the accent hue drifts slowly round the colour
        wheel (~48 s per lap). Inline CSS variables on #strata-root override
        the skin rules, so everything — UI and visuals — follows the hue.
    */

    let prismCycleTimer =
        0;

    let prismHue =
        Math.random() *
        360;

    function hslToRgbString(
        hue,
        saturation,
        lightness
    ) {
        const h =
            (
                (
                    hue %
                        360
                ) +
                360
            ) %
            360 /
            360;

        const q =
            lightness <
                0.5
                ? lightness *
                    (
                        1 +
                        saturation
                    )
                : lightness +
                    saturation -
                    lightness *
                        saturation;

        const p =
            2 *
                lightness -
            q;

        const channel =
            t => {
                const x =
                    (
                        t +
                        1
                    ) %
                    1;

                if (
                    x <
                        1 / 6
                ) {
                    return p +
                        (
                            q -
                            p
                        ) *
                            6 *
                            x;
                }

                if (
                    x <
                        1 / 2
                ) {
                    return q;
                }

                if (
                    x <
                        2 / 3
                ) {
                    return p +
                        (
                            q -
                            p
                        ) *
                            (
                                2 / 3 -
                                x
                            ) *
                            6;
                }

                return p;
            };

        return [
            channel(
                h +
                    1 / 3
            ),
            channel(
                h
            ),
            channel(
                h -
                    1 / 3
            )
        ]
            .map(
                value =>
                    Math.round(
                        value *
                            255
                    )
            )
            .join(
                ', '
            );
    }

    /*
        v8.6.0: the prism loop is 420 steps: 360 of hue, then 60 where the
        colour eases into white and back out, so white is part of the cycle.
    */
    const PRISM_LOOP = 420;

    function prismColour( lightness, whiteLightness ) {
        if ( prismHue < 360 ) {
            return hslToRgbString( prismHue, 1, lightness );
        }

        const white = Math.sin( Math.PI * ( prismHue - 360 ) / 60 );

        return hslToRgbString(
            0,
            1 - white,
            lightness + ( whiteLightness - lightness ) * white
        );
    }

    function applyPrismColours(
        root
    ) {
        root.style.setProperty(
            '--st-accent-rgb',
            prismColour( 0.55, 0.9 )
        );

        root.style.setProperty(
            '--st-accent-bright-rgb',
            prismColour( 0.74, 0.97 )
        );

        root.style.setProperty(
            '--st-accent-glow-rgb',
            prismColour( 0.66, 0.95 )
        );
    }

    function updatePrismCycle() {
        const root =
            document.getElementById(
                'strata-root'
            );

        if (!root) {
            return;
        }

        if (
            currentSkin ===
                'cycle'
        ) {
            if (
                !prismCycleTimer
            ) {
                prismCycleTimer =
                    setInterval(
                        () => {
                            if (
                                document.hidden
                            ) {
                                return;
                            }

                            prismHue =
                                (
                                    prismHue +
                                    0.9
                                ) %
                                PRISM_LOOP;

                            applyPrismColours(
                                root
                            );
                        },
                        120
                    );
            }

            applyPrismColours(
                root
            );

            return;
        }

        if (
            prismCycleTimer
        ) {
            clearInterval(
                prismCycleTimer
            );

            prismCycleTimer =
                0;
        }

        for (
            const name
            of [
                '--st-accent-rgb',
                '--st-accent-bright-rgb',
                '--st-accent-glow-rgb'
            ]
        ) {
            root.style.removeProperty(
                name
            );
        }
    }

    function applySkin(
        skinId,
        persist = true
    ) {
        currentSkin =
            normalizeSkinId(
                skinId
            );

        const root =
            document.getElementById(
                'strata-root'
            );

        if (root) {
            root.dataset.skin =
                currentSkin;
        }

        updatePrismCycle();

        if (persist) {
            GM_setValue(
                SKIN_KEY,
                currentSkin
            );
        }
    }

    function cachedElementById(
        id
    ) {
        const existing =
            strataDomCache.get(
                id
            );

        if (
            existing &&
            existing.isConnected
        ) {
            return existing;
        }

        const current =
            document.getElementById(
                id
            );

        if (current) {
            strataDomCache.set(
                id,
                current
            );

        } else {
            strataDomCache.delete(
                id
            );
        }

        return current;
    }

    function currentMainVideo() {
        if (
            cachedMainVideoElement &&
            cachedMainVideoElement.isConnected
        ) {
            return cachedMainVideoElement;
        }

        cachedMainVideoElement =
            document.querySelector(
                'video.html5-main-video'
            );

        return cachedMainVideoElement;
    }

    function ensureVisualizerCanvasMetrics(
        canvas
    ) {
        if (
            visualizerObservedCanvas !==
                canvas
        ) {
            visualizerCanvasResizeObserver
                ?.disconnect?.();

            visualizerObservedCanvas =
                canvas;

            const rect =
                canvas.getBoundingClientRect();

            visualizerCanvasCssWidth =
                rect.width;

            visualizerCanvasCssHeight =
                rect.height;

            if (
                typeof ResizeObserver ===
                    'function'
            ) {
                visualizerCanvasResizeObserver =
                    new ResizeObserver(
                        entries => {
                            const entry =
                                entries[
                                    entries.length -
                                        1
                                ];

                            if (
                                !entry ||
                                entry.target !==
                                    visualizerObservedCanvas
                            ) {
                                return;
                            }

                            visualizerCanvasCssWidth =
                                entry.contentRect
                                    .width;

                            visualizerCanvasCssHeight =
                                entry.contentRect
                                    .height;
                        }
                    );

                visualizerCanvasResizeObserver.observe(
                    canvas
                );

            } else {
                visualizerCanvasResizeObserver =
                    null;
            }
        }

        /*
            A hidden visual panel reports 0×0. On return from a utility page,
            refresh once if ResizeObserver has not published the restored size
            yet. Normal visible frames do not force a layout measurement.
        */

        if (
            !visualizerCanvasResizeObserver ||
            visualizerCanvasCssWidth <
                10 ||
            visualizerCanvasCssHeight <
                10
        ) {
            const rect =
                canvas.getBoundingClientRect();

            visualizerCanvasCssWidth =
                rect.width;

            visualizerCanvasCssHeight =
                rect.height;
        }
    }

    function prepareVisualizerBandRanges() {
        if (
            !visualizerAnalyser ||
            !visualizerContext ||
            !visualizerSpectrum
        ) {
            visualizerBandRanges =
                null;

            return;
        }

        const ranges = [
            [
                24,
                90
            ],
            [
                90,
                220
            ],
            [
                220,
                650
            ],
            [
                650,
                2600
            ],
            [
                2600,
                8000
            ],
            [
                8000,
                16000
            ]
        ];

        visualizerBandRanges =
            ranges.map(
                ([
                    lowHz,
                    highHz
                ]) => ({
                    lowHz,
                    highHz,
                    start:
                        frequencyBinForHz(
                            lowHz
                        ),
                    end:
                        Math.max(
                            frequencyBinForHz(
                                lowHz
                            ),
                            frequencyBinForHz(
                                highHz
                            )
                        )
                })
            );
    }

    function prepareTrackAnalysisLookupTables() {
        if (
            !visualizerContext ||
            !trackAnalysisTempoAnalyser ||
            !trackAnalysisKeyAnalyser ||
            !trackAnalysisTempoSpectrum ||
            !trackAnalysisKeySpectrum
        ) {
            trackAnalysisTempoWeights =
                null;

            trackAnalysisKeyPitchClasses =
                null;

            trackAnalysisKeyStaticWeights =
                null;

            return;
        }

        const tempoBinHz =
            visualizerContext.sampleRate /
            trackAnalysisTempoAnalyser.fftSize;

        trackAnalysisTempoMaxBin =
            Math.min(
                trackAnalysisTempoSpectrum.length -
                    1,
                Math.ceil(
                    2400 /
                    tempoBinHz
                )
            );

        trackAnalysisTempoWeights =
            new Float64Array(
                trackAnalysisTempoMaxBin +
                    1
            );


        for (
            let index = 1;
            index <=
                trackAnalysisTempoMaxBin;
            index++
        ) {
            const hz =
                index *
                tempoBinHz;

            let weight =
                0.38;

            if (
                hz <
                180
            ) {
                weight =
                    1.45;

            } else if (
                hz <
                420
            ) {
                weight =
                    0.92;

            } else if (
                hz <
                1200
            ) {
                weight =
                    0.58;
            }

            trackAnalysisTempoWeights[
                index
            ] =
                weight;

        }

        const keyBinHz =
            visualizerContext.sampleRate /
            trackAnalysisKeyAnalyser.fftSize;

        trackAnalysisKeyStartBin =
            Math.max(
                1,
                Math.floor(
                    65 /
                    keyBinHz
                )
            );

        trackAnalysisKeyEndBin =
            Math.min(
                trackAnalysisKeySpectrum.length -
                    1,
                Math.ceil(
                    4200 /
                    keyBinHz
                )
            );

        trackAnalysisKeyPitchClasses =
            new Int8Array(
                trackAnalysisKeySpectrum.length
            );

        trackAnalysisKeyPitchClasses.fill(
            -1
        );

        trackAnalysisKeyStaticWeights =
            new Float64Array(
                trackAnalysisKeySpectrum.length
            );

        for (
            let index =
                trackAnalysisKeyStartBin;
            index <=
                trackAnalysisKeyEndBin;
            index++
        ) {
            const hz =
                index *
                keyBinHz;

            const midi =
                69 +
                12 *
                    Math.log2(
                        hz /
                            440
                    );

            const nearest =
                Math.round(
                    midi
                );

            const cents =
                Math.abs(
                    midi -
                        nearest
                );

            const tuningWeight =
                Math.max(
                    0,
                    1 -
                        cents /
                            0.5
                );

            if (
                tuningWeight <=
                    0
            ) {
                continue;
            }

            trackAnalysisKeyPitchClasses[
                index
            ] =
                (
                    (
                        nearest %
                            12
                    ) +
                    12
                ) %
                12;

            trackAnalysisKeyStaticWeights[
                index
            ] =
                tuningWeight /
                Math.sqrt(
                    Math.max(
                        1,
                        hz /
                            220
                    )
                );
        }
    }

    // ============================================================
    // AUDIO VISUAL ENGINE — EXPERIMENTAL
    //
    // Passive architecture:
    // YouTube video -> captureStream() clone -> Web Audio Analyser.
    //
    // The analyser is never connected to an audio destination. STRATA only
    // observes the stream. If the browser refuses an audio tap, every style
    // still has a transport-synchronised fallback.
    // ============================================================

    function clamp01(
        value
    ) {
        return Math.max(
            0,
            Math.min(
                1,
                Number(
                    value
                ) ||
                0
            )
        );
    }

    function visualizerStyleDefinition() {
        return (
            VISUALIZER_STYLES.find(
                style =>
                    style.id ===
                    visualizerStyle
            ) ||
            VISUALIZER_STYLES[0]
        );
    }

    function visualizerReactivityProfile() {
        return (
            VISUALIZER_REACTIVITY[
                visualizerReactivity
            ] ||
            VISUALIZER_REACTIVITY
                .balanced
        );
    }

    function visualizerMetricReactivityProfile() {
        if (
            visualizerStyle !==
                'vector'
        ) {
            return visualizerReactivityProfile();
        }

        if (
            visualizerReactivity ===
                'high'
        ) {
            return VISUALIZER_REACTIVITY
                .balanced;
        }

        if (
            visualizerReactivity ===
                'balanced'
        ) {
            return VISUALIZER_REACTIVITY
                .low;
        }

        return VECTOR_LOWER_REACTIVITY;
    }

    function setVisualizerStyle(
        style
    ) {
        visualizerStyle =
            normalizeVisualizerStyle(
                style
            );

        visualizerPeakBars =
            [];

        visualizerSpectrumLevels =
            [];

        visualizerCascadeHistory =
            [];

        visualizerCascadeLastCapture =
            0;

        GM_setValue(
            VISUALIZER_STYLE_KEY,
            visualizerStyle
        );

        updateVisualizerHud();
    }

    function setVisualizerStyleActive(
        styleId,
        enabled
    ) {
        const normalized =
            normalizeVisualizerStyle(
                styleId
            );

        const currentlyActive =
            isVisualizerStyleActive(
                normalized
            );

        if (
            enabled ===
                currentlyActive
        ) {
            return true;
        }

        if (
            !enabled &&
            visualizerActiveStyles.length <=
                1
        ) {
            setStatus(
                'Keep at least one visual in the cycle'
            );

            return false;
        }

        if (enabled) {
            visualizerActiveStyles =
                VISUALIZER_STYLES
                    .map(
                        style =>
                            style.id
                    )
                    .filter(
                        id =>
                            id ===
                                normalized ||
                            visualizerActiveStyles.includes(
                                id
                            )
                    );

        } else {
            const oldIndex =
                VISUALIZER_STYLES.findIndex(
                    style =>
                        style.id ===
                        normalized
                );

            visualizerActiveStyles =
                visualizerActiveStyles.filter(
                    id =>
                        id !==
                        normalized
                );

            if (
                visualizerStyle ===
                    normalized
            ) {
                for (
                    let offset = 1;
                    offset <=
                        VISUALIZER_STYLES.length;
                    offset++
                ) {
                    const candidate =
                        VISUALIZER_STYLES[
                            (
                                oldIndex +
                                offset +
                                VISUALIZER_STYLES.length
                            ) %
                            VISUALIZER_STYLES.length
                        ];

                    if (
                        candidate &&
                        visualizerActiveStyles.includes(
                            candidate.id
                        )
                    ) {
                        setVisualizerStyle(
                            candidate.id
                        );

                        break;
                    }
                }
            }
        }

        GM_setValue(
            VISUALIZER_ACTIVE_STYLES_KEY,
            visualizerActiveStyles
        );

        updateVisualizerHud();

        return true;
    }

    function cycleVisualizerStyle(
        direction
    ) {
        const enabledStyles =
            activeVisualizerStyles();

        if (
            !enabledStyles.length
        ) {
            return;
        }

        let currentIndex =
            enabledStyles.findIndex(
                style =>
                    style.id ===
                    visualizerStyle
            );

        if (
            currentIndex <
            0
        ) {
            currentIndex =
                direction < 0
                    ? 0
                    : enabledStyles.length -
                        1;
        }

        const step =
            direction < 0
                ? -1
                : 1;

        const nextIndex =
            (
                currentIndex +
                step +
                enabledStyles.length
            ) %
            enabledStyles.length;

        const next =
            enabledStyles[
                nextIndex
            ];

        setVisualizerStyle(
            next.id
        );

        setStatus(
            `${next.label} visual · ${enabledStyles.length} in cycle`
        );
    }

    function setVisualizerReactivity(
        value
    ) {
        visualizerReactivity =
            normalizeVisualizerReactivity(
                value
            );

        GM_setValue(
            VISUALIZER_REACTIVITY_KEY,
            visualizerReactivity
        );

        updateVisualizerHud();

        updateMainVisualizerReactivityControls();
    }

    function updateMainVisualizerReactivityControls() {
        for (
            const id
            of Object.keys(
                VISUALIZER_REACTIVITY
            )
        ) {
            const button =
                cachedElementById(
                    `strata-visual-reactivity-${id}`
                );

            if (!button) {
                continue;
            }

            button.classList.toggle(
                'active',
                id ===
                    visualizerReactivity
            );

            button.setAttribute(
                'aria-pressed',
                id ===
                    visualizerReactivity
                    ? 'true'
                    : 'false'
            );
        }
    }

    function visualizerAccent(
        alpha
    ) {
        const root =
            document.getElementById(
                'strata-root'
            );

        const rgb =
            root
                ? getComputedStyle(
                    root
                )
                    .getPropertyValue(
                        '--st-accent-rgb'
                    )
                    .trim()
                : '0, 242, 255';

        return `rgba(${rgb || '0, 242, 255'}, ${alpha})`;
    }

    function updateVisualizerHud() {
        const styleLabel =
            cachedElementById(
                'strata-visualizer-style-label'
            );

        const badge =
            cachedElementById(
                'strata-visualizer-mode'
            );

        const meter =
            cachedElementById(
                'strata-visualizer-meter'
            );

        const video =
            currentMainVideo();

        if (styleLabel) {
            const nextLabel =
                visualizerStyleDefinition().label;

            if (
                styleLabel.textContent !==
                    nextLabel
            ) {
                styleLabel.textContent =
                    nextLabel;
            }
        }

        if (badge) {
            let nextText =
                'TRANSPORT';

            let nextMode =
                'transport';

            if (
                video?.paused
            ) {
                nextText =
                    'PAUSED';

                nextMode =
                    'paused';

            } else if (
                visualizerMode ===
                    'AUDIO'
            ) {
                nextText =
                    'AUDIO REACTIVE';

                nextMode =
                    'audio';
            }

            if (
                badge.textContent !==
                    nextText
            ) {
                badge.textContent =
                    nextText;
            }

            if (
                badge.dataset.mode !==
                    nextMode
            ) {
                badge.dataset.mode =
                    nextMode;
            }
        }

        if (meter) {
            const nextMeter =
                visualizerMode ===
                    'AUDIO'
                    ? `SUB ${Math.round(visualizerMetrics.sub * 99)
                        .toString()
                        .padStart(2, '0')}  BASS ${Math.round(visualizerMetrics.bass * 99)
                        .toString()
                        .padStart(2, '0')}  MID ${Math.round(visualizerMetrics.mid * 99)
                        .toString()
                        .padStart(2, '0')}  HIGH ${Math.round(visualizerMetrics.high * 99)
                        .toString()
                        .padStart(2, '0')}`
                    : 'PASSIVE TRANSPORT SYNC';

            if (
                meter.textContent !==
                    nextMeter
            ) {
                meter.textContent =
                    nextMeter;
            }
        }
    }

    function releaseVisualizerAudio() {
        try {
            visualizerSource
                ?.disconnect();
        } catch {}

        if (
            visualizerContext
        ) {
            try {
                visualizerContext
                    .close();
            } catch {}
        }

        visualizerContext =
            null;

        visualizerSource =
            null;

        visualizerAnalyser =
            null;

        visualizerVideo =
            null;

        visualizerWave =
            null;

        visualizerSpectrum =
            null;

        visualizerSpectrumAnalyser =
            null;

        visualizerSpectrumFloat =
            null;

        visualizerSpectrumBarPlan =
            null;

        visualizerSpectrumLevels =
            [];

        trackAnalysisTempoAnalyser =
            null;

        trackAnalysisKeyAnalyser =
            null;

        trackAnalysisTempoSpectrum =
            null;

        trackAnalysisPreviousTempoSpectrum =
            null;

        trackAnalysisKeySpectrum =
            null;

        trackAnalysisTempoWeights =
            null;

        trackAnalysisTempoMaxBin =
            0;


        trackAnalysisKeyPitchClasses =
            null;

        trackAnalysisKeyStaticWeights =
            null;

        trackAnalysisKeyStartBin =
            0;

        trackAnalysisKeyEndBin =
            -1;

        visualizerBandRanges =
            null;

        visualizerMode =
            'TRANSPORT';

        visualizerPreviousRawSub =
            0;

        visualizerPreviousRawRms =
            0;

        visualizerPulse =
            0;

        visualizerMetrics = {
            sub:
                0,

            bass:
                0,

            lowMid:
                0,

            mid:
                0,

            high:
                0,

            air:
                0,

            rms:
                0
        };

        updateVisualizerHud();
    }

    async function attachVisualizerAudio() {
        const video =
            currentMainVideo();

        if (!video) {
            return;
        }

        if (
            visualizerVideo ===
                video &&
            visualizerAnalyser
        ) {
            if (
                visualizerContext
                    ?.state ===
                'suspended'
            ) {
                try {
                    await visualizerContext
                        .resume();
                } catch {}
            }

            return;
        }

        const now =
            Date.now();

        if (
            now <
            visualizerRetryAt
        ) {
            return;
        }

        visualizerRetryAt =
            now +
            3500;

        releaseVisualizerAudio();

        const capture =
            video.captureStream ||
            video.mozCaptureStream;

        if (
            typeof capture !==
            'function'
        ) {
            return;
        }

        try {
            const stream =
                capture.call(
                    video
                );

            if (
                !stream
                    ?.getAudioTracks?.()
                    ?.length
            ) {
                return;
            }

            const AudioContextCtor =
                window.AudioContext ||
                window.webkitAudioContext;

            if (!AudioContextCtor) {
                return;
            }

            const context =
                new AudioContextCtor();

            const source =
                context.createMediaStreamSource(
                    stream
                );

            const analyser =
                context.createAnalyser();

            analyser.fftSize =
                2048;

            analyser.smoothingTimeConstant =
                0.62;

            analyser.minDecibels =
                -92;

            analyser.maxDecibels =
                -16;

            const tempoAnalyser =
                context.createAnalyser();

            tempoAnalyser.fftSize =
                2048;

            tempoAnalyser.smoothingTimeConstant =
                0.16;

            tempoAnalyser.minDecibels =
                -96;

            tempoAnalyser.maxDecibels =
                -14;

            const keyAnalyser =
                context.createAnalyser();

            /*
                A larger FFT is used only for the slower harmonic analysis.
                At a 48 kHz sample rate this gives roughly 2.9 Hz/bin.
            */

            keyAnalyser.fftSize =
                16384;

            keyAnalyser.smoothingTimeConstant =
                0.72;

            keyAnalyser.minDecibels =
                -100;

            keyAnalyser.maxDecibels =
                -18;

            /*
                v8.5.90: dedicated analyser for the SPECTRUM visual only.
                Read as float dB, so min/maxDecibels never clip it. 8192
                points gives ~5.9 Hz/bin at 48 kHz for the low bars.
            */

            const spectrumAnalyser =
                context.createAnalyser();

            spectrumAnalyser.fftSize =
                8192;

            spectrumAnalyser.smoothingTimeConstant =
                0.45;

            /*
                Passive branches only:
                captured source -> visual analyser
                                -> tempo analyser
                                -> harmonic analyser

                None of these nodes is connected to the audible destination.
            */

            source.connect(
                analyser
            );

            source.connect(
                tempoAnalyser
            );

            source.connect(
                keyAnalyser
            );

            source.connect(
                spectrumAnalyser
            );

            visualizerSpectrumAnalyser =
                spectrumAnalyser;

            visualizerSpectrumFloat =
                new Float32Array(
                    spectrumAnalyser.frequencyBinCount
                );

            visualizerSpectrumBarPlan =
                null;

            visualizerSpectrumRefDb =
                -30;

            visualizerContext =
                context;

            visualizerSource =
                source;

            visualizerAnalyser =
                analyser;

            visualizerVideo =
                video;

            visualizerWave =
                new Uint8Array(
                    analyser.fftSize
                );

            visualizerSpectrum =
                new Uint8Array(
                    analyser.frequencyBinCount
                );

            trackAnalysisTempoAnalyser =
                tempoAnalyser;

            trackAnalysisKeyAnalyser =
                keyAnalyser;

            trackAnalysisTempoSpectrum =
                new Uint8Array(
                    tempoAnalyser.frequencyBinCount
                );

            trackAnalysisPreviousTempoSpectrum =
                new Uint8Array(
                    tempoAnalyser.frequencyBinCount
                );

            trackAnalysisKeySpectrum =
                new Float32Array(
                    keyAnalyser.frequencyBinCount
                );

            prepareVisualizerBandRanges();

            prepareTrackAnalysisLookupTables();

            visualizerMode =
                'AUDIO';

            if (
                context.state ===
                'suspended'
            ) {
                try {
                    await context.resume();
                } catch {}
            }

            updateVisualizerHud();

        } catch (
            error
        ) {
            console.debug(
                '[STRATA] VISUAL ENGINE using transport fallback',
                error
            );

            visualizerMode =
                'TRANSPORT';

            updateVisualizerHud();
        }
    }

    function frequencyBinForHz(
        hz
    ) {
        if (
            !visualizerAnalyser ||
            !visualizerContext
        ) {
            return 0;
        }

        const binHz =
            visualizerContext
                .sampleRate /
            visualizerAnalyser
                .fftSize;

        return Math.max(
            0,
            Math.min(
                visualizerSpectrum
                    ?.length -
                    1 ||
                    0,
                Math.round(
                    hz /
                    binHz
                )
            )
        );
    }

    function rawBandEnergy(
        lowHz,
        highHz
    ) {
        if (
            !visualizerSpectrum ||
            !visualizerSpectrum.length
        ) {
            return 0;
        }

        const cachedRange =
            visualizerBandRanges
                ?.find(
                    range =>
                        range.lowHz ===
                            lowHz &&
                        range.highHz ===
                            highHz
                );

        const start =
            cachedRange
                ? cachedRange.start
                : frequencyBinForHz(
                    lowHz
                );

        const end =
            cachedRange
                ? cachedRange.end
                : Math.max(
                    start,
                    frequencyBinForHz(
                        highHz
                    )
                );

        let sum =
            0;

        let peak =
            0;

        let count =
            0;

        for (
            let index = start;
            index <=
                end;
            index++
        ) {
            const value =
                visualizerSpectrum[
                    index
                ] ||
                0;

            sum +=
                value;

            peak =
                Math.max(
                    peak,
                    value
                );

            count++;
        }

        if (!count) {
            return 0;
        }

        const average =
            sum /
            count;

        const mixed =
            average *
                0.72 +
            peak *
                0.28;

        return clamp01(
            mixed /
                255
        );
    }

    const VISUALIZER_METRIC_KEYS = [
        'sub',
        'bass',
        'lowMid',
        'mid',
        'high',
        'air',
        'rms'
    ];

    function updateVisualizerMetrics(
        deltaSeconds
    ) {
        if (
            !visualizerAnalyser ||
            !visualizerWave ||
            !visualizerSpectrum
        ) {
            visualizerPulse *=
                0.90;

            return;
        }

        visualizerAnalyser
            .getByteTimeDomainData(
                visualizerWave
            );

        visualizerAnalyser
            .getByteFrequencyData(
                visualizerSpectrum
            );

        const profile =
            visualizerMetricReactivityProfile();

        const raw = {
            sub:
                rawBandEnergy(
                    24,
                    90
                ),

            bass:
                rawBandEnergy(
                    90,
                    220
                ),

            lowMid:
                rawBandEnergy(
                    220,
                    650
                ),

            mid:
                rawBandEnergy(
                    650,
                    2600
                ),

            high:
                rawBandEnergy(
                    2600,
                    8000
                ),

            air:
                rawBandEnergy(
                    8000,
                    16000
                ),

            rms:
                0
        };

        let squareSum =
            0;

        let samples =
            0;

        for (
            let index = 0;
            index <
                visualizerWave.length;
            index +=
                8
        ) {
            const sample =
                (
                    visualizerWave[
                        index
                    ] -
                    128
                ) /
                128;

            squareSum +=
                sample *
                sample;

            samples++;
        }

        raw.rms =
            samples
                ? Math.sqrt(
                    squareSum /
                    samples
                )
                : 0;

        for (
            const key
            of VISUALIZER_METRIC_KEYS
        ) {
            let target =
                raw[
                    key
                ] *
                profile.gain;

            /*
                A gentle curve lifts quieter musical detail without turning
                silence into motion.
            */

            target =
                Math.pow(
                    clamp01(
                        target
                    ),
                    0.78
                );

            const current =
                visualizerMetrics[
                    key
                ];

            const coefficient =
                target >
                    current
                    ? profile.attack
                    : profile.release;

            visualizerMetrics[
                key
            ] =
                current +
                (
                    target -
                    current
                ) *
                    coefficient;
        }

        const subTransient =
            Math.max(
                0,
                raw.sub -
                    visualizerPreviousRawSub
            );

        const rmsTransient =
            Math.max(
                0,
                raw.rms -
                    visualizerPreviousRawRms
            );

        const hit =
            clamp01(
                (
                    subTransient *
                    profile.transient *
                    2.6
                ) +
                (
                    rmsTransient *
                    profile.transient *
                    2.0
                )
            );

        const decay =
            Math.pow(
                0.84,
                Math.max(
                    0.5,
                    deltaSeconds *
                        60
                )
            );

        visualizerPulse =
            Math.max(
                visualizerPulse *
                    decay,
                hit
            );

        visualizerPreviousRawSub =
            raw.sub;

        visualizerPreviousRawRms =
            raw.rms;

        visualizerPhase +=
            deltaSeconds *
            (
                0.30 +
                visualizerMetrics.mid *
                    0.62 +
                visualizerMetrics.high *
                    0.24
            );
    }

    function spectrumValueAtFraction(
        fraction
    ) {
        if (
            !visualizerSpectrum ||
            !visualizerSpectrum.length ||
            !visualizerContext ||
            !visualizerAnalyser
        ) {
            return 0;
        }

        const clamped =
            clamp01(
                fraction
            );

        const minHz =
            28;

        const maxHz =
            Math.min(
                16500,
                visualizerContext
                    .sampleRate *
                    0.46
            );

        const hz =
            minHz *
            Math.pow(
                maxHz /
                    minHz,
                clamped
            );

        const bin =
            frequencyBinForHz(
                hz
            );

        const radius =
            2;

        let total =
            0;

        let count =
            0;

        for (
            let offset = -radius;
            offset <=
                radius;
            offset++
        ) {
            const index =
                Math.max(
                    0,
                    Math.min(
                        visualizerSpectrum
                            .length -
                            1,
                        bin +
                            offset
                    )
                );

            total +=
                visualizerSpectrum[
                    index
                ] ||
                0;

            count++;
        }

        return count
            ? clamp01(
                (
                    total /
                    count /
                    255
                ) *
                    visualizerReactivityProfile()
                        .gain
            )
            : 0;
    }

    function drawVisualizerBackground(
        context,
        width,
        height
    ) {
        context.clearRect(
            0,
            0,
            width,
            height
        );

        context.fillStyle =
            'rgba(1, 7, 9, .965)';

        context.fillRect(
            0,
            0,
            width,
            height
        );

        /*
            Low-end bloom. This remains restrained at rest but becomes very
            visible on kicks/transients.
        */

        const bloom =
            context.createRadialGradient(
                width *
                    0.50,
                height *
                    0.52,
                0,
                width *
                    0.50,
                height *
                    0.52,
                Math.max(
                    width,
                    height
                ) *
                    0.68
            );

        bloom.addColorStop(
            0,
            visualizerAccent(
                0.040 +
                visualizerMetrics.sub *
                    0.085 +
                visualizerPulse *
                    0.15
            )
        );

        bloom.addColorStop(
            0.44,
            visualizerAccent(
                0.014 +
                visualizerMetrics.mid *
                    0.026 +
                visualizerPulse *
                    0.035
            )
        );

        bloom.addColorStop(
            1,
            'rgba(0,0,0,0)'
        );

        context.fillStyle =
            bloom;

        context.fillRect(
            0,
            0,
            width,
            height
        );

        context.strokeStyle =
            visualizerAccent(
                0.060 +
                visualizerMetrics.mid *
                    0.040 +
                visualizerMetrics.high *
                    0.018
            );

        context.lineWidth =
            1;

        context.beginPath();

        const gridX =
            42;

        const gridY =
            36;

        for (
            let x = gridX;
            x <
                width;
            x +=
                gridX
        ) {
            context.moveTo(
                x,
                0
            );

            context.lineTo(
                x,
                height
            );
        }

        for (
            let y = gridY;
            y <
                height;
            y +=
                gridY
        ) {
            context.moveTo(
                0,
                y
            );

            context.lineTo(
                width,
                y
            );
        }

        context.stroke();

        context.save();

        context.shadowColor =
            visualizerAccent(
                0.58
            );

        context.shadowBlur =
            5 +
            visualizerPulse *
                15;

        context.strokeStyle =
            visualizerAccent(
                0.15 +
                visualizerPulse *
                    0.48
            );

        context.lineWidth =
            1 +
            visualizerPulse *
                0.75;

        context.strokeRect(
            7.5,
            7.5,
            Math.max(
                0,
                width -
                    15
            ),
            Math.max(
                0,
                height -
                    15
            )
        );

        context.restore();
    }

    function drawTransportWave(
        context,
        width,
        height,
        video,
        scale = 1
    ) {
        const time =
            Number(
                video?.currentTime
            ) ||
            performance.now() /
                1000;

        const points =
            Math.max(
                140,
                Math.floor(
                    width /
                    2
                )
            );

        const amplitude =
            height *
            (
                video?.paused
                    ? 0.025
                    : 0.085
            ) *
            scale;

        context.beginPath();

        for (
            let index = 0;
            index <=
                points;
            index++
        ) {
            const x =
                (
                    index /
                    points
                ) *
                width;

            const phase =
                (
                    index /
                    points
                ) *
                Math.PI *
                8;

            const y =
                height *
                    0.5 +
                amplitude *
                    (
                        Math.sin(
                            phase +
                            time *
                                1.82
                        ) *
                            0.68 +
                        Math.sin(
                            phase *
                                2.31 -
                            time *
                                0.91
                        ) *
                            0.22 +
                        Math.sin(
                            phase *
                                0.47 +
                            time *
                                0.29
                        ) *
                            0.10
                    );

            if (
                index ===
                0
            ) {
                context.moveTo(
                    x,
                    y
                );

            } else {
                context.lineTo(
                    x,
                    y
                );
            }
        }
    }

    function drawVectorStyle(
        context,
        width,
        height,
        video
    ) {
        /*
            VECTOR is now a pure oscilloscope. Spectrum information lives only
            in the dedicated SPECTRUM mode.
        */

        const drawMainTrace =
            offsetY => {
                context.beginPath();

                if (
                    visualizerMode ===
                        'AUDIO' &&
                    visualizerWave
                ) {
                    const amplitude =
                        height *
                        (
                            0.30 +
                            visualizerMetrics.sub *
                                0.15 +
                            visualizerMetrics.bass *
                                0.08 +
                            visualizerPulse *
                                0.12
                        );

                    const length =
                        visualizerWave
                            .length;

                    for (
                        let index = 0;
                        index <
                            length;
                        index +=
                            4
                    ) {
                        const x =
                            (
                                index /
                                (
                                    length -
                                    1
                                )
                            ) *
                            width;

                        const sample =
                            (
                                visualizerWave[
                                    index
                                ] -
                                128
                            ) /
                            128;

                        const shimmer =
                            Math.sin(
                                index *
                                    0.031 +
                                visualizerPhase *
                                    5.2
                            ) *
                            visualizerMetrics.air *
                            height *
                            0.005;

                        const y =
                            height *
                                0.50 +
                            sample *
                                amplitude +
                            shimmer +
                            offsetY;

                        if (
                            index ===
                            0
                        ) {
                            context.moveTo(
                                x,
                                y
                            );

                        } else {
                            context.lineTo(
                                x,
                                y
                            );
                        }
                    }

                } else {
                    drawTransportWave(
                        context,
                        width,
                        height,
                        video,
                        1.12 +
                            visualizerPulse *
                                0.72
                    );
                }
            };

        /*
            Faint horizontal reference rails give VECTOR some instrument
            structure without turning it back into a spectrum display.
        */

        context.save();

        context.strokeStyle =
            visualizerAccent(
                0.07 +
                visualizerMetrics.mid *
                    0.03
            );

        context.lineWidth =
            1;

        for (
            const fraction
            of [
                0.25,
                0.50,
                0.75
            ]
        ) {
            context.beginPath();

            context.moveTo(
                12,
                height *
                    fraction
            );

            context.lineTo(
                width -
                    12,
                height *
                    fraction
            );

            context.stroke();
        }

        context.restore();

        context.save();

        context.lineJoin =
            'round';

        context.lineCap =
            'round';

        context.shadowColor =
            visualizerAccent(
                0.92
            );

        context.shadowBlur =
            14 +
            visualizerPulse *
                26 +
            visualizerMetrics.air *
                8;

        context.strokeStyle =
            visualizerAccent(
                0.98
            );

        context.lineWidth =
            1.35 +
            visualizerMetrics.rms *
                1.15 +
            visualizerPulse *
                0.62;

        drawMainTrace(
            0
        );

        context.stroke();

        const ghosts = [
            {
                y:
                    2.2 +
                    visualizerPulse *
                        3.8,

                alpha:
                    0.28
            },
            {
                y:
                    -2.0 -
                    visualizerPulse *
                        2.5,

                alpha:
                    0.14
            }
        ];

        for (
            const ghost
            of ghosts
        ) {
            context.save();

            context.globalAlpha =
                ghost.alpha +
                visualizerMetrics.air *
                    0.08;

            context.shadowBlur =
                5;

            context.strokeStyle =
                visualizerAccent(
                    0.72
                );

            drawMainTrace(
                ghost.y
            );

            context.stroke();

            context.restore();
        }

        context.restore();

        if (
            visualizerPulse >
            0.08
        ) {
            const half =
                width *
                (
                    0.16 +
                    visualizerPulse *
                        0.34
                );

            context.save();

            context.shadowColor =
                visualizerAccent(
                    0.92
                );

            context.shadowBlur =
                12 +
                visualizerPulse *
                    20;

            context.strokeStyle =
                visualizerAccent(
                    0.18 +
                    visualizerPulse *
                        0.70
                );

            context.lineWidth =
                1.2 +
                visualizerPulse *
                    1.2;

            context.beginPath();

            context.moveTo(
                width *
                    0.5 -
                    half,
                height *
                    0.5
            );

            context.lineTo(
                width *
                    0.5 +
                    half,
                height *
                    0.5
            );

            context.stroke();

            context.restore();
        }
    }

    // ============================================================
    // SPECTRUM DISPLAY ENGINE (v8.5.90)
    //
    // Dedicated 8192-point analyser read as float dB, so loud kicks are
    // no longer flattened at the analyser's 8-bit ceiling. Each of the
    // bars averages the power across its own log-spaced frequency range
    // (interpolating where a bar is narrower than one FFT bin), a gentle
    // +3 dB/oct tilt balances the natural roll-off of mixed music, and a
    // rolling auto-gain tracks the loudest bar so loud and quiet tracks
    // both use the full height. LOW / BALANCED / HIGH choose headroom,
    // displayed dynamic range and ballistics. The top is soft-kneed.
    // ============================================================

    const SPECTRUM_DISPLAY_MIN_HZ =
        30;

    const SPECTRUM_DISPLAY_MAX_HZ =
        16000;

    const SPECTRUM_DISPLAY_TILT_DB_PER_OCT =
        3;

    const SPECTRUM_DISPLAY_PROFILES = {
        low: {
            headroomDb: 6,
            rangeDb: 54,
            attackTau: 0.060,
            releasePerSecond: 1.05
        },

        balanced: {
            headroomDb: 4,
            rangeDb: 47,
            attackTau: 0.040,
            releasePerSecond: 1.45
        },

        high: {
            headroomDb: 2.5,
            rangeDb: 40,
            attackTau: 0.025,
            releasePerSecond: 2.0
        }
    };

    function spectrumDisplayProfile() {
        return (
            SPECTRUM_DISPLAY_PROFILES[
                visualizerReactivity
            ] ||
            SPECTRUM_DISPLAY_PROFILES
                .balanced
        );
    }

    function buildSpectrumBarPlan(
        bars
    ) {
        const sampleRate =
            visualizerContext
                .sampleRate;

        const fftSize =
            visualizerSpectrumAnalyser
                .fftSize;

        const binHz =
            sampleRate /
            fftSize;

        const minHz =
            SPECTRUM_DISPLAY_MIN_HZ;

        const maxHz =
            Math.min(
                SPECTRUM_DISPLAY_MAX_HZ,
                sampleRate *
                    0.46
            );

        const ratio =
            maxHz /
            minHz;

        const items =
            [];

        for (
            let bar = 0;
            bar < bars;
            bar++
        ) {
            const loHz =
                minHz *
                Math.pow(
                    ratio,
                    bar / bars
                );

            const hiHz =
                minHz *
                Math.pow(
                    ratio,
                    (bar + 1) / bars
                );

            const centreHz =
                Math.sqrt(
                    loHz *
                    hiHz
                );

            items.push({
                lo:
                    loHz / binHz,

                hi:
                    hiHz / binHz,

                centre:
                    centreHz / binHz,

                tiltDb:
                    SPECTRUM_DISPLAY_TILT_DB_PER_OCT *
                    Math.log2(
                        centreHz /
                            1000
                    )
            });
        }

        return {
            bars,
            sampleRate,
            fftSize,
            items
        };
    }

    function spectrumFloatDbAt(
        index
    ) {
        const data =
            visualizerSpectrumFloat;

        const clampedIndex =
            Math.max(
                0,
                Math.min(
                    data.length - 1,
                    index
                )
            );

        const value =
            data[
                clampedIndex
            ];

        return Number.isFinite(
            value
        )
            ? value
            : -160;
    }

    function computeSpectrumBarLevels(
        bars
    ) {
        if (
            !visualizerSpectrumAnalyser ||
            !visualizerSpectrumFloat ||
            !visualizerContext
        ) {
            return null;
        }

        if (
            !visualizerSpectrumBarPlan ||
            visualizerSpectrumBarPlan.bars !== bars ||
            visualizerSpectrumBarPlan.sampleRate !==
                visualizerContext.sampleRate ||
            visualizerSpectrumBarPlan.fftSize !==
                visualizerSpectrumAnalyser.fftSize
        ) {
            visualizerSpectrumBarPlan =
                buildSpectrumBarPlan(
                    bars
                );
        }

        if (
            visualizerSpectrumLevels.length !==
            bars
        ) {
            visualizerSpectrumLevels =
                new Array(
                    bars
                ).fill(
                    0
                );
        }

        visualizerSpectrumAnalyser
            .getFloatFrequencyData(
                visualizerSpectrumFloat
            );

        const now =
            performance.now();

        const delta =
            visualizerSpectrumLastTime
                ? Math.min(
                    0.25,
                    Math.max(
                        0.001,
                        (now - visualizerSpectrumLastTime) / 1000
                    )
                )
                : 1 / 30;

        visualizerSpectrumLastTime =
            now;

        const profile =
            spectrumDisplayProfile();

        const items =
            visualizerSpectrumBarPlan
                .items;

        const dbs =
            new Array(
                bars
            );

        let frameMax =
            -Infinity;

        for (
            let bar = 0;
            bar < bars;
            bar++
        ) {
            const item =
                items[bar];

            let db;

            if (
                item.hi - item.lo <
                1.5
            ) {
                // Narrower than ~1.5 bins: interpolate at the centre so
                // neighbouring low bars differ instead of duplicating.

                const base =
                    Math.floor(
                        item.centre
                    );

                const t =
                    item.centre -
                    base;

                const a =
                    spectrumFloatDbAt(
                        base
                    );

                const b =
                    spectrumFloatDbAt(
                        base + 1
                    );

                db =
                    a +
                    (b - a) * t;

            } else {
                const first =
                    Math.max(
                        0,
                        Math.ceil(
                            item.lo
                        )
                    );

                const last =
                    Math.max(
                        first,
                        Math.floor(
                            item.hi
                        )
                    );

                let power =
                    0;

                let count =
                    0;

                for (
                    let index = first;
                    index <= last;
                    index++
                ) {
                    power +=
                        Math.pow(
                            10,
                            spectrumFloatDbAt(
                                index
                            ) / 10
                        );

                    count++;
                }

                db =
                    count
                        ? 10 *
                            Math.log10(
                                Math.max(
                                    1e-16,
                                    power / count
                                )
                            )
                        : -160;
            }

            db +=
                item.tiltDb;

            dbs[bar] =
                db;

            if (
                db >
                frameMax
            ) {
                frameMax =
                    db;
            }
        }

        // Rolling reference: rises quickly, falls slowly, and never
        // drops below -62 dB so near-silence is not boosted into noise.

        if (
            frameMax >
            -100
        ) {
            const tau =
                frameMax >
                    visualizerSpectrumRefDb
                    ? 0.14
                    : 3.8;

            visualizerSpectrumRefDb +=
                (
                    frameMax -
                    visualizerSpectrumRefDb
                ) *
                (
                    1 -
                    Math.exp(
                        -delta / tau
                    )
                );
        }

        visualizerSpectrumRefDb =
            Math.max(
                -62,
                Math.min(
                    12,
                    visualizerSpectrumRefDb
                )
            );

        const top =
            visualizerSpectrumRefDb +
            profile.headroomDb;

        const bottom =
            top -
            profile.rangeDb;

        const attack =
            1 -
            Math.exp(
                -delta /
                    profile.attackTau
            );

        const knee =
            0.80;

        for (
            let bar = 0;
            bar < bars;
            bar++
        ) {
            let target =
                (
                    dbs[bar] -
                    bottom
                ) /
                profile.rangeDb;

            if (
                target <
                0
            ) {
                target =
                    0;

            } else if (
                target >
                knee
            ) {
                // Soft knee: approaches the ceiling, never slams into it.

                target =
                    knee +
                    (1 - knee) *
                        Math.tanh(
                            (target - knee) /
                                (1 - knee)
                        );
            }

            const current =
                visualizerSpectrumLevels[
                    bar
                ];

            visualizerSpectrumLevels[
                bar
            ] =
                target >=
                    current
                    ? current +
                        (target - current) *
                            attack
                    : Math.max(
                        target,
                        current -
                            profile.releasePerSecond *
                                delta
                    );
        }

        return visualizerSpectrumLevels;
    }

    function drawSpectrumStyle(
        context,
        width,
        height
    ) {
        const bars =
            44;

        /*
            v8.5.90 — the bar heights come from computeSpectrumBarLevels(),
            which reads float dB data (no 8-bit ceiling), auto-gains to the
            track and soft-knees the top. Pulse/bass now only drive colour
            and glow, never height, so bars can no longer be multiplied
            past the ceiling.
        */

        const levels =
            visualizerMode ===
                'AUDIO'
                ? computeSpectrumBarLevels(
                    bars
                )
                : null;

        if (
            visualizerPeakBars.length !==
            bars
        ) {
            visualizerPeakBars =
                new Array(
                    bars
                ).fill(
                    0
                );
        }

        const now =
            performance.now();

        const peakDelta =
            visualizerSpectrumPeakTime
                ? Math.min(
                    0.25,
                    Math.max(
                        0,
                        (now - visualizerSpectrumPeakTime) / 1000
                    )
                )
                : 0;

        visualizerSpectrumPeakTime =
            now;

        const gap =
            Math.max(
                2,
                width *
                    0.0036
            );

        const barWidth =
            (
                width -
                gap *
                    (
                        bars -
                        1
                    )
            ) /
            bars;

        const floor =
            height *
            0.82;

        const span =
            height *
            0.68;

        context.save();

        context.shadowColor =
            visualizerAccent(
                0.70
            );

        context.shadowBlur =
            4 +
            visualizerPulse *
                10;

        for (
            let bar = 0;
            bar <
                bars;
            bar++
        ) {
            const fraction =
                bar /
                (
                    bars -
                    1
                );

            const fallback =
                0.10 +
                0.095 *
                    (
                        0.5 +
                        0.5 *
                            Math.sin(
                                visualizerPhase *
                                    2.4 +
                                bar *
                                    0.47
                            )
                    );

            const value =
                levels
                    ? levels[bar]
                    : fallback;

            const lowBias =
                Math.pow(
                    1 -
                        fraction,
                    1.6
                );

            const heightValue =
                Math.max(
                    2,
                    value *
                        span
                );

            const x =
                bar *
                (
                    barWidth +
                    gap
                );

            const y =
                floor -
                heightValue;

            context.fillStyle =
                visualizerAccent(
                    0.16 +
                    value *
                        0.64 +
                    lowBias *
                        visualizerPulse *
                        0.14
                );

            context.fillRect(
                x,
                y,
                barWidth,
                heightValue
            );

            /*
                Peak caps share the bar's exact scale (previously the bar
                used pow(v, .82) while the cap used v, so caps hid inside
                the bars except when clipped).
            */

            visualizerPeakBars[
                bar
            ] =
                Math.max(
                    value,
                    visualizerPeakBars[
                        bar
                    ] -
                        peakDelta *
                            0.30
                );

            const peakY =
                floor -
                Math.max(
                    2,
                    visualizerPeakBars[
                        bar
                    ] *
                        span
                ) -
                2;

            context.fillStyle =
                visualizerAccent(
                    0.82
                );

            context.fillRect(
                x,
                peakY,
                barWidth,
                1.6
            );
        }

        context.restore();

        const pulseWidth =
            width *
            (
                0.14 +
                visualizerMetrics.sub *
                    0.62 +
                visualizerPulse *
                    0.25
            );

        context.save();

        context.shadowColor =
            visualizerAccent(
                0.90
            );

        context.shadowBlur =
            8 +
            visualizerPulse *
                20;

        context.strokeStyle =
            visualizerAccent(
                0.30 +
                visualizerPulse *
                    0.62
            );

        context.lineWidth =
            1.7 +
            visualizerPulse *
                1.6;

        context.beginPath();

        context.moveTo(
            width *
                0.5 -
                pulseWidth *
                    0.5,
            floor +
                11
        );

        context.lineTo(
            width *
                0.5 +
                pulseWidth *
                    0.5,
            floor +
                11
        );

        context.stroke();

        context.restore();
    }

    function drawCascadeStyle(
        context,
        width,
        height,
        timestamp
    ) {
        /*
            CASCADE is deliberately unlike ORBIT: it is a scrolling spectral
            history. New frequency information appears at the bottom and
            recedes upward, giving techno transients a visible after-image.
        */

        const bins =
            46;

        const rows =
            26;

        if (
            timestamp -
                visualizerCascadeLastCapture >
            44
        ) {
            const snapshot =
                [];

            for (
                let index = 0;
                index <
                    bins;
                index++
            ) {
                const fraction =
                    index /
                    (
                        bins -
                        1
                    );

                const fallback =
                    0.08 +
                    0.055 *
                        (
                            0.5 +
                            0.5 *
                                Math.sin(
                                    visualizerPhase *
                                        2.6 +
                                    index *
                                        0.41
                                )
                        );

                snapshot.push(
                    visualizerMode ===
                        'AUDIO'
                        ? spectrumValueAtFraction(
                            fraction
                        )
                        : fallback
                );
            }

            visualizerCascadeHistory.push(
                snapshot
            );

            if (
                visualizerCascadeHistory.length >
                rows
            ) {
                visualizerCascadeHistory.shift();
            }

            visualizerCascadeLastCapture =
                timestamp;
        }

        while (
            visualizerCascadeHistory.length <
            rows
        ) {
            visualizerCascadeHistory.unshift(
                new Array(
                    bins
                ).fill(
                    0
                )
            );
        }

        const horizon =
            height *
            0.84;

        const top =
            height *
            0.18;

        const usableHeight =
            horizon -
            top;

        const xPadding =
            width *
            0.045;

        const usableWidth =
            width -
            xPadding *
                2;

        /*
            Perspective rails.
        */

        context.save();

        context.strokeStyle =
            visualizerAccent(
                0.09
            );

        context.lineWidth =
            1;

        context.beginPath();

        context.moveTo(
            xPadding,
            horizon
        );

        context.lineTo(
            width *
                0.22,
            top
        );

        context.moveTo(
            width -
                xPadding,
            horizon
        );

        context.lineTo(
            width *
                0.78,
            top
        );

        context.stroke();

        context.restore();

        /*
            Draw oldest at the top, newest at the bottom.
        */

        for (
            let row = 0;
            row <
                visualizerCascadeHistory.length;
            row++
        ) {
            const age =
                row /
                Math.max(
                    1,
                    visualizerCascadeHistory.length -
                        1
                );

            const perspective =
                0.56 +
                age *
                    0.44;

            const rowWidth =
                usableWidth *
                perspective;

            const rowLeft =
                width *
                    0.5 -
                rowWidth *
                    0.5;

            const y =
                top +
                age *
                    usableHeight;

            const energy =
                visualizerCascadeHistory[
                    row
                ];

            context.save();

            context.lineJoin =
                'round';

            context.lineCap =
                'round';

            const newestBoost =
                Math.pow(
                    age,
                    2.2
                );

            context.strokeStyle =
                visualizerAccent(
                    0.06 +
                    newestBoost *
                        0.42 +
                    visualizerPulse *
                        newestBoost *
                        0.18
                );

            context.lineWidth =
                0.7 +
                newestBoost *
                    0.9;

            context.shadowColor =
                visualizerAccent(
                    0.55
                );

            context.shadowBlur =
                newestBoost *
                (
                    2 +
                    visualizerMetrics.high *
                        7
                );

            context.beginPath();

            for (
                let bin = 0;
                bin <
                    bins;
                bin++
            ) {
                const fraction =
                    bin /
                    (
                        bins -
                        1
                    );

                const value =
                    energy[
                        bin
                    ] ||
                    0;

                const lowBias =
                    Math.pow(
                        1 -
                            fraction,
                        1.5
                    );

                const x =
                    rowLeft +
                    fraction *
                        rowWidth;

                const lift =
                    Math.pow(
                        value,
                        0.82
                    ) *
                    height *
                    (
                        0.11 +
                        newestBoost *
                            0.10
                    ) *
                    (
                        0.85 +
                        lowBias *
                            visualizerMetrics.bass *
                            0.38
                    );

                const pointY =
                    y -
                    lift;

                if (
                    bin ===
                    0
                ) {
                    context.moveTo(
                        x,
                        pointY
                    );

                } else {
                    context.lineTo(
                        x,
                        pointY
                    );
                }
            }

            context.stroke();

            context.restore();
        }

        /*
            The newest row gets a luminous baseline and transient push.
        */

        const newest =
            visualizerCascadeHistory[
                visualizerCascadeHistory.length -
                    1
            ] ||
            [];

        context.save();

        context.shadowColor =
            visualizerAccent(
                0.92
            );

        context.shadowBlur =
            8 +
            visualizerPulse *
                18;

        context.strokeStyle =
            visualizerAccent(
                0.46 +
                visualizerPulse *
                    0.42
            );

        context.lineWidth =
            1.25 +
            visualizerPulse *
                0.8;

        context.beginPath();

        for (
            let bin = 0;
            bin <
                bins;
            bin++
        ) {
            const fraction =
                bin /
                (
                    bins -
                        1
                );

            const value =
                newest[
                    bin
                ] ||
                0;

            const x =
                xPadding +
                fraction *
                    usableWidth;

            const y =
                horizon -
                Math.pow(
                    value,
                    0.82
                ) *
                    height *
                    (
                        0.19 +
                        visualizerPulse *
                            0.055
                    );

            if (
                bin ===
                0
            ) {
                context.moveTo(
                    x,
                    y
                );

            } else {
                context.lineTo(
                    x,
                    y
                );
            }
        }

        context.stroke();

        context.restore();

        if (
            visualizerPulse >
            0.06
        ) {
            context.save();

            context.strokeStyle =
                visualizerAccent(
                    0.18 +
                    visualizerPulse *
                        0.46
                );

            context.lineWidth =
                1 +
                visualizerPulse;

            context.beginPath();

            context.moveTo(
                width *
                    0.5 -
                    usableWidth *
                        visualizerPulse *
                        0.32,
                horizon +
                    9
            );

            context.lineTo(
                width *
                    0.5 +
                    usableWidth *
                        visualizerPulse *
                        0.32,
                horizon +
                    9
            );

            context.stroke();

            context.restore();
        }
    }

    function drawOrbitStyle(
        context,
        width,
        height
    ) {
        const centreX =
            width *
            0.50;

        const centreY =
            height *
            0.51;

        const minDimension =
            Math.min(
                width,
                height
            );

        const baseRadius =
            minDimension *
            (
                0.17 +
                visualizerMetrics.sub *
                    0.050 +
                visualizerMetrics.bass *
                    0.025 +
                visualizerPulse *
                    0.065
            );

        const segments =
            88;

        /*
            Breathing core + concentric bass rings.
        */

        context.save();

        context.translate(
            centreX,
            centreY
        );

        context.shadowColor =
            visualizerAccent(
                0.86
            );

        context.shadowBlur =
            9 +
            visualizerPulse *
                21;

        for (
            let ring = 0;
            ring <
                3;
            ring++
        ) {
            const radius =
                baseRadius *
                (
                    0.42 +
                    ring *
                        0.17
                ) +
                visualizerPulse *
                    minDimension *
                    (
                        0.010 +
                        ring *
                            0.008
                    );

            context.strokeStyle =
                visualizerAccent(
                    0.14 +
                    visualizerMetrics.sub *
                        0.20 +
                    visualizerPulse *
                        (
                            0.42 -
                            ring *
                                0.08
                        )
                );

            context.lineWidth =
                1.0 +
                visualizerPulse *
                    (
                        1.4 -
                        ring *
                            0.2
                    );

            context.beginPath();

            context.arc(
                0,
                0,
                radius,
                0,
                Math.PI *
                    2
            );

            context.stroke();
        }

        context.restore();

        /*
            Radial spectrum.
        */

        context.save();

        context.translate(
            centreX,
            centreY
        );

        context.rotate(
            visualizerPhase *
                (
                    0.10 +
                    visualizerMetrics.high *
                        0.08
                )
        );

        context.shadowColor =
            visualizerAccent(
                0.58
            );

        context.shadowBlur =
            3 +
            visualizerMetrics.air *
                8;

        for (
            let segment = 0;
            segment <
                segments;
            segment++
        ) {
            const fraction =
                segment /
                segments;

            const angle =
                fraction *
                Math.PI *
                2;

            const folded =
                fraction <=
                    0.5
                    ? fraction *
                        2
                    : (
                        1 -
                        fraction
                    ) *
                        2;

            const fallback =
                0.10 +
                0.08 *
                    (
                        0.5 +
                        0.5 *
                            Math.sin(
                                visualizerPhase *
                                    3.0 +
                                segment *
                                    0.33
                            )
                    );

            const value =
                visualizerMode ===
                    'AUDIO'
                    ? spectrumValueAtFraction(
                        folded
                    )
                    : fallback;

            const lowBias =
                1 -
                folded;

            const inner =
                baseRadius *
                (
                    0.94 +
                    visualizerPulse *
                        0.03
                );

            const outer =
                inner +
                value *
                    minDimension *
                    (
                        0.22 +
                        visualizerMetrics.mid *
                            0.06
                    ) +
                lowBias *
                    visualizerPulse *
                    minDimension *
                    0.050;

            const x1 =
                Math.cos(
                    angle
                ) *
                inner;

            const y1 =
                Math.sin(
                    angle
                ) *
                inner;

            const x2 =
                Math.cos(
                    angle
                ) *
                outer;

            const y2 =
                Math.sin(
                    angle
                ) *
                outer;

            context.strokeStyle =
                visualizerAccent(
                    0.16 +
                    value *
                        0.68 +
                    visualizerPulse *
                        lowBias *
                        0.16
                );

            context.lineWidth =
                0.85 +
                value *
                    1.45 +
                lowBias *
                    visualizerPulse *
                    0.55;

            context.beginPath();

            context.moveTo(
                x1,
                y1
            );

            context.lineTo(
                x2,
                y2
            );

            context.stroke();
        }

        /*
            High-frequency tracer pair.
        */

        const tracerAngle =
            visualizerPhase *
            (
                0.75 +
                visualizerMetrics.high *
                    0.80
            );

        const tracerRadius =
            baseRadius *
                0.72;

        for (
            const direction
            of [
                1,
                -1
            ]
        ) {
            const angle =
                tracerAngle *
                direction;

            context.fillStyle =
                visualizerAccent(
                    0.70 +
                    visualizerMetrics.air *
                        0.26
                );

            context.shadowColor =
                visualizerAccent(
                    0.92
                );

            context.shadowBlur =
                12 +
                visualizerMetrics.air *
                    10;

            context.beginPath();

            context.arc(
                Math.cos(
                    angle
                ) *
                    tracerRadius,
                Math.sin(
                    angle
                ) *
                    tracerRadius,
                2.0 +
                    visualizerMetrics.high *
                        3.0,
                0,
                Math.PI *
                    2
            );

            context.fill();
        }

        context.restore();

        /*
            Kick shockwave. It appears briefly and expands beyond the orbit.
        */

        if (
            visualizerPulse >
            0.07
        ) {
            context.save();

            context.shadowColor =
                visualizerAccent(
                    0.90
                );

            context.shadowBlur =
                12;

            context.strokeStyle =
                visualizerAccent(
                    visualizerPulse *
                        0.58
                );

            context.lineWidth =
                1 +
                visualizerPulse *
                    1.2;

            context.beginPath();

            context.arc(
                centreX,
                centreY,
                baseRadius +
                    minDimension *
                        (
                            0.04 +
                            (
                                1 -
                                visualizerPulse
                            ) *
                                0.08
                        ),
                0,
                Math.PI *
                    2
            );

            context.stroke();

            context.restore();
        }
    }

    function drawPhaseStyle(
        context,
        width,
        height,
        video
    ) {
        const centreX =
            width *
            0.50;

        const centreY =
            height *
            0.51;

        const radiusX =
            width *
            (
                0.27 +
                visualizerMetrics.sub *
                    0.035 +
                visualizerPulse *
                    0.025
            );

        const radiusY =
            height *
            (
                0.31 +
                visualizerMetrics.bass *
                    0.045 +
                visualizerPulse *
                    0.030
            );

        /*
            Instrument guides: crosshair + phase ellipse.
        */

        context.save();

        context.strokeStyle =
            visualizerAccent(
                0.07 +
                visualizerMetrics.mid *
                    0.025
            );

        context.lineWidth =
            1;

        context.beginPath();

        context.moveTo(
            centreX,
            14
        );

        context.lineTo(
            centreX,
            height -
                14
        );

        context.moveTo(
            14,
            centreY
        );

        context.lineTo(
            width -
                14,
            centreY
        );

        context.stroke();

        context.strokeStyle =
            visualizerAccent(
                0.10 +
                visualizerMetrics.air *
                    0.04
            );

        context.beginPath();

        context.ellipse(
            centreX,
            centreY,
            radiusX,
            radiusY,
            0,
            0,
            Math.PI *
                2
        );

        context.stroke();

        context.restore();

        const drawAudioPhaseTrace =
            (
                delay,
                rotation,
                alpha,
                lineWidth,
                glow
            ) => {
                if (
                    !visualizerWave ||
                    visualizerWave.length <
                        delay +
                            8
                ) {
                    return;
                }

                const length =
                    visualizerWave
                        .length;

                const step =
                    3;

                context.save();

                context.translate(
                    centreX,
                    centreY
                );

                context.rotate(
                    rotation
                );

                context.beginPath();

                let started =
                    false;

                for (
                    let index = 0;
                    index <
                        length -
                        delay;
                    index +=
                        step
                ) {
                    const xSample =
                        (
                            visualizerWave[
                                index
                            ] -
                            128
                        ) /
                        128;

                    const ySample =
                        (
                            visualizerWave[
                                index +
                                    delay
                            ] -
                            128
                        ) /
                        128;

                    /*
                        High-frequency energy adds fine-grained jitter while
                        sub/bass energy expands the whole figure.
                    */

                    const shimmer =
                        Math.sin(
                            index *
                                0.071 +
                            visualizerPhase *
                                7.4
                        ) *
                        visualizerMetrics.air *
                        0.022;

                    const x =
                        (
                            xSample +
                            shimmer
                        ) *
                        radiusX *
                        (
                            1 +
                            visualizerMetrics.rms *
                                0.18
                        );

                    const y =
                        (
                            ySample -
                            shimmer
                        ) *
                        radiusY *
                        (
                            1 +
                            visualizerMetrics.mid *
                                0.12
                        );

                    if (!started) {
                        context.moveTo(
                            x,
                            y
                        );

                        started =
                            true;

                    } else {
                        context.lineTo(
                            x,
                            y
                        );
                    }
                }

                context.globalAlpha =
                    alpha;

                context.strokeStyle =
                    visualizerAccent(
                        0.92
                );

                context.lineWidth =
                    lineWidth;

                context.lineJoin =
                    'round';

                context.lineCap =
                    'round';

                context.shadowColor =
                    visualizerAccent(
                        0.92
                    );

                context.shadowBlur =
                    glow;

                context.stroke();

                context.restore();
            };

        if (
            visualizerMode ===
                'AUDIO' &&
            visualizerWave
        ) {
            const baseDelay =
                29 +
                Math.round(
                    visualizerMetrics.mid *
                        26
                );

            drawAudioPhaseTrace(
                baseDelay,
                visualizerPhase *
                    0.025,
                0.94,
                1.15 +
                    visualizerMetrics.rms *
                        0.8,
                12 +
                    visualizerPulse *
                        16
            );

            drawAudioPhaseTrace(
                baseDelay +
                    19,
                -0.045 -
                    visualizerPhase *
                        0.014,
                0.24 +
                    visualizerMetrics.high *
                        0.16,
                0.85,
                6
            );

            drawAudioPhaseTrace(
                Math.max(
                    9,
                    baseDelay -
                        11
                ),
                0.055 +
                    visualizerPhase *
                        0.010,
                0.13 +
                    visualizerMetrics.air *
                        0.14,
                0.7,
                4
            );

        } else {
            /*
                Transport fallback: a genuine parametric phase figure rather
                than reusing VECTOR's waveform animation.
            */

            const time =
                Number(
                    video?.currentTime
                ) ||
                performance.now() /
                    1000;

            const points =
                360;

            context.save();

            context.translate(
                centreX,
                centreY
            );

            context.rotate(
                visualizerPhase *
                    0.05
            );

            context.beginPath();

            for (
                let index = 0;
                index <=
                    points;
                index++
            ) {
                const t =
                    (
                        index /
                        points
                    ) *
                    Math.PI *
                    2;

                const x =
                    Math.sin(
                        t *
                            3 +
                        time *
                            0.35
                    ) *
                    radiusX *
                    0.72;

                const y =
                    Math.sin(
                        t *
                            2 +
                        time *
                            0.29 +
                        Math.PI /
                            3
                    ) *
                    radiusY *
                    0.72;

                if (
                    index ===
                    0
                ) {
                    context.moveTo(
                        x,
                        y
                    );

                } else {
                    context.lineTo(
                        x,
                        y
                    );
                }
            }

            context.strokeStyle =
                visualizerAccent(
                    0.88
                );

            context.lineWidth =
                1.15;

            context.shadowColor =
                visualizerAccent(
                    0.78
                );

            context.shadowBlur =
                10;

            context.stroke();

            context.restore();
        }

        /*
            Transient halo and four energy nodes.
        */

        if (
            visualizerPulse >
            0.05
        ) {
            context.save();

            context.strokeStyle =
                visualizerAccent(
                    0.15 +
                    visualizerPulse *
                        0.54
                );

            context.lineWidth =
                1 +
                visualizerPulse;

            context.shadowColor =
                visualizerAccent(
                    0.88
                );

            context.shadowBlur =
                9 +
                visualizerPulse *
                    13;

            context.beginPath();

            context.ellipse(
                centreX,
                centreY,
                radiusX *
                    (
                        1 +
                        visualizerPulse *
                            0.11
                    ),
                radiusY *
                    (
                        1 +
                        visualizerPulse *
                            0.11
                    ),
                0,
                0,
                Math.PI *
                    2
            );

            context.stroke();

            context.restore();
        }

        const nodes = [
            {
                angle:
                    visualizerPhase *
                        0.8,

                energy:
                    visualizerMetrics.sub
            },
            {
                angle:
                    visualizerPhase *
                        -1.05 +
                    Math.PI /
                        2,

                energy:
                    visualizerMetrics.mid
            },
            {
                angle:
                    visualizerPhase *
                        1.25 +
                    Math.PI,

                energy:
                    visualizerMetrics.high
            },
            {
                angle:
                    visualizerPhase *
                        -1.45 +
                    Math.PI *
                        1.5,

                energy:
                    visualizerMetrics.air
            }
        ];

        context.save();

        context.shadowColor =
            visualizerAccent(
                0.90
            );

        context.shadowBlur =
            8;

        for (
            const node
            of nodes
        ) {
            const nodeRadiusX =
                radiusX *
                (
                    0.54 +
                    node.energy *
                        0.20
                );

            const nodeRadiusY =
                radiusY *
                (
                    0.54 +
                    node.energy *
                        0.20
                );

            const x =
                centreX +
                Math.cos(
                    node.angle
                ) *
                nodeRadiusX;

            const y =
                centreY +
                Math.sin(
                    node.angle
                ) *
                nodeRadiusY;

            context.fillStyle =
                visualizerAccent(
                    0.30 +
                    node.energy *
                        0.62
                );

            context.beginPath();

            context.arc(
                x,
                y,
                1.3 +
                    node.energy *
                        2.4,
                0,
                Math.PI *
                    2
            );

            context.fill();
        }

        context.restore();
    }

    // ============================================================
    // v8.5.88 — AETHER
    //
    // Ported from the Aether editor (tuned there, then committed here).
    // Most of the time: unstructured particle ether, scattered by kicks.
    // Every ~30 s the chaos organises into a wormhole in the cranium of a
    // half-seen 3D head, with a torus stream circling through it. The head
    // turns between front and profile, drifts through moods and fleeting
    // expressions, then everything dissolves back into the ether.
    //
    // Self-contained closure; it only reads STRATA's live audio metrics,
    // pulse and reactivity profile.
    // ============================================================

    const aetherVisual = (() => {
        const TUNE = {
            faceNoise: 3.7,
            faceGrip: 0.39,
            faceShow: 0.71,
            faceBright: 1.25,
            funnelNoise: 2.8,
            loopNoise: 0.7,
            funnelGrip: 0.33,
            funnelDensity: 0.35,
            columnDensity: 0.16,
            outerDensity: 0.06,
            throatFade: 0.44,
            throatDepth: 0.52,
            funnelBright: 0.2,
            loopBright: 0.55,
            torusBright: 1.75,
            etherChaos: 0.85,
            etherBright: 2.1,
            holdSeconds: 21,
            gapSeconds: 30,
            fadeSeconds: 6
        };
        const tune = TUNE;
        const settings = { face: 'auto', expression: 'auto' };
        const DPR = 1;
        const reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        let metrics = visualizerMetrics;
        let pulse = 0;

        function accentRgb() {
            const root = document.getElementById('strata-root');
            return (root ? getComputedStyle(root).getPropertyValue('--st-accent-rgb').trim() : '') || '0, 242, 255';
        }

  // ---------------------------------------------------------------- expressions
  // lid: eyelid openness · brow: raise · furrow: inner brows down (+) / up (-)
  // gazeX/gazeY: iris offset · mouth: corners down (+) / up (-) · open: lips apart
  const EXPRESSIONS = {
    neutral:    { lid: 1.00, brow: 0.00, furrow: 0.00, gazeX: 0, gazeY: 0.00, mouth: 0.00, open: 0.00 },
    focused:    { lid: 0.88, brow: -0.35, furrow: 1.00, gazeX: 0, gazeY: 0.00, mouth: 0.30, open: 0.00 },
    drowsy:     { lid: 0.42, brow: 0.05, furrow: 0.00, gazeX: 0, gazeY: 0.25, mouth: 0.10, open: 0.00 },
    closed:     { lid: 0.00, brow: 0.10, furrow: 0.00, gazeX: 0, gazeY: 0.00, mouth: -0.10, open: 0.00 },
    awe:        { lid: 1.25, brow: 0.70, furrow: -0.20, gazeX: 0, gazeY: -0.55, mouth: -0.05, open: 0.35 },
    melancholy: { lid: 0.50, brow: 0.20, furrow: -0.70, gazeX: 0.15, gazeY: 0.60, mouth: 0.65, open: 0.00 }
  };

  const expr = { ...EXPRESSIONS.neutral, browAsym: 0, mouthAsym: 0 };
  const mood = { name: 'neutral', since: 0, energy: 0.3, bright: 0.2, low: 0.2 };

  function chooseMood(dt, now) {
    const k = 1 - Math.exp(-dt / 3);
    mood.energy += (metrics.rms - mood.energy) * k;
    mood.bright += (metrics.high - mood.bright) * k;
    mood.low += (metrics.bass - mood.low) * k;
    let next;
    if (mood.energy < 0.14) next = 'closed';
    else if (mood.energy < 0.28) next = mood.bright < 0.18 && mood.low > 0.18 ? 'melancholy' : 'drowsy';
    else if (mood.energy < 0.50) next = metrics.mid > 0.5 ? 'focused' : 'neutral';
    else if (mood.energy < 0.68) next = 'focused';
    else next = 'awe';
    if (next !== mood.name && now - mood.since > 6000) { mood.name = next; mood.since = now; }
  }

  function updateExpression(dt) {
    const target = EXPRESSIONS[settings.expression === 'auto' ? mood.name : settings.expression];
    const k = 1 - Math.exp(-dt / 1.6);
    for (const key of Object.keys(expr)) expr[key] += ((target[key] ?? 0) - expr[key]) * k;
    updateGestures(dt);
  }

  // ---------------------------------------------------------------- gestures
  // Fleeting micro-expressions layered on top of the mood: a furrow, raised
  // brows, parted lips, a squint, one brow, a half smile, a glance, a blink.
  const GESTURES = [
    { name: 'raised brows', d: { brow: 1.1, lid: 0.15 } },
    { name: 'furrow', d: { furrow: 1.5, brow: -0.4, lid: -0.12 } },
    { name: 'parted lips', d: { open: 1.0, lid: 0.08, brow: 0.15 } },
    { name: 'squint', d: { lid: -0.45, mouth: 0.15, furrow: 0.3 } },
    { name: 'one brow', d: { browAsym: 0.7, brow: 0.2 }, mirror: ['browAsym'] },
    { name: 'half smile', d: { mouthAsym: 0.55, mouth: -0.25 }, mirror: ['mouthAsym'] },
    { name: 'glance', d: { gazeX: 0.9, gazeY: -0.1 }, mirror: ['gazeX'] },
    { name: 'blink', d: { lid: -1.3 }, fast: true },
    { name: 'sigh', d: { lid: -0.35, open: 0.25, brow: 0.2, mouth: 0.2 } }
  ];
  const gesture = { active: null, env: 0, phase: 'idle', until: 0, nextAt: performance.now() + 3000 };

  function updateGestures(dt) {
    const now = performance.now();
    if (gesture.phase === 'idle' && now > gesture.nextAt) {
      const pick = GESTURES[Math.floor(Math.random() * GESTURES.length)];
      const flip = Math.random() < 0.5 ? -1 : 1;
      const d = { ...pick.d };
      for (const key of pick.mirror || []) d[key] *= flip;
      gesture.active = { name: pick.name, d, fast: Boolean(pick.fast) };
      gesture.phase = 'in';
    }
    const attack = gesture.active && gesture.active.fast ? 0.09 : 0.7;
    const release = gesture.active && gesture.active.fast ? 0.12 : 1.1;
    if (gesture.phase === 'in') {
      gesture.env = Math.min(1, gesture.env + dt / attack);
      if (gesture.env >= 1) {
        gesture.phase = 'hold';
        gesture.until = now + (gesture.active.fast ? 60 : 700 + Math.random() * 1600);
      }
    } else if (gesture.phase === 'hold' && now > gesture.until) {
      gesture.phase = 'out';
    } else if (gesture.phase === 'out') {
      gesture.env = Math.max(0, gesture.env - dt / release);
      if (gesture.env <= 0) {
        gesture.phase = 'idle';
        gesture.active = null;
        gesture.nextAt = now + 1500 + Math.random() * 4500;
      }
    }
  }

  function faceExpression() {
    const e = { ...expr };
    if (gesture.active) {
      const s = gesture.env * gesture.env * (3 - 2 * gesture.env);
      for (const [key, value] of Object.entries(gesture.active.d)) e[key] = (e[key] || 0) + value * s;
    }
    e.lid = Math.max(0, e.lid);
    e.open = Math.max(0, e.open);
    return e;
  }

  // ---------------------------------------------------------------- 3D head model
  // Unit space: x right, y DOWN, z toward the viewer. Cranium cut at y=-0.62.
  const RIM_Y = -0.62, CHIN_Y = 0.98;
  const CAMERA_TILT = 0.27;                       // camera looks slightly down
  const CAM_COS = Math.cos(CAMERA_TILT), CAM_SIN = Math.sin(CAMERA_TILT);

  function lerpTable(table, y) {
    if (y <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (y <= table[i][0]) {
        const [y0, v0] = table[i - 1], [y1, v1] = table[i];
        const t = (y - y0) / (y1 - y0);
        const s = t * t * (3 - 2 * t);
        return v0 + (v1 - v0) * s;
      }
    }
    return table[table.length - 1][1];
  }

  // half-width, face-surface depth, midline profile depth (forehead, nose,
  // lips, chin) and back-of-head depth, all as functions of height
  const WIDTH = [[-0.62, 0.50], [-0.30, 0.56], [0.18, 0.58], [0.50, 0.50], [0.78, 0.30], [0.93, 0.13], [0.98, 0.02]];
  const FACE = [[-0.62, 0.48], [-0.16, 0.51], [0.0, 0.45], [0.20, 0.49], [0.46, 0.47], [0.80, 0.38], [0.95, 0.20], [0.98, 0.05]];
  const MID = [[-0.62, 0.54], [-0.40, 0.58], [-0.17, 0.60], [-0.07, 0.555], [0.10, 0.65], [0.22, 0.75], [0.27, 0.66],
               [0.31, 0.60], [0.40, 0.625], [0.46, 0.585], [0.53, 0.61], [0.63, 0.555], [0.78, 0.60], [0.90, 0.40], [0.98, 0.08]];
  const BACK = [[-0.62, 0.56], [-0.25, 0.63], [0.20, 0.58], [0.55, 0.42], [0.80, 0.24], [0.98, 0.16]];

  const headWSlow = y => lerpTable(WIDTH, y);
  // v8.5.89 performance: head width from a precomputed lookup table
  const HW_MIN = -0.9, HW_MAX = 1.3, HW_N = 512;
  const HW_LUT = new Float32Array(HW_N + 1);
  for (let i = 0; i <= HW_N; i++) HW_LUT[i] = headWSlow(HW_MIN + (HW_MAX - HW_MIN) * i / HW_N);
  const headW = y => {
    const f = (Math.min(HW_MAX, Math.max(HW_MIN, y)) - HW_MIN) / (HW_MAX - HW_MIN) * HW_N;
    const i = Math.floor(f), t = f - i;
    return i >= HW_N ? HW_LUT[HW_N] : HW_LUT[i] + (HW_LUT[i + 1] - HW_LUT[i]) * t;
  };
  const zFront = (phi, y) => {
    const c = Math.cos(phi);
    const face = lerpTable(FACE, y), mid = lerpTable(MID, y);
    return face * c + (mid - face) * Math.pow(Math.max(0, c), 26);
  };
  function crossSection(phi, y) {
    const w = headW(y);
    const c = Math.cos(phi);
    return [w * Math.sin(phi), c >= 0 ? zFront(phi, y) : lerpTable(BACK, y) * c];
  }

  // place a front-view point onto the face surface
  function lift(x, y) {
    const w = Math.max(0.05, headW(y));
    const phi = Math.asin(Math.max(-0.98, Math.min(0.98, x / w)));
    return [x, y, zFront(phi, y), Math.sin(phi), Math.cos(phi)];
  }

  // head pose → screen. Rotation order: yaw, pitch, roll, then camera tilt.
  const head = {
    x: 0, y: 0, yaw: 0, pitch: 0, roll: 0,
    vx: 0, vy: 0, vyaw: 0, vpitch: 0, vroll: 0,
    tx: 0, ty: 0, tyaw: 0, tpitch: 0, troll: 0,
    holdUntil: 0, lastX: 0, lastY: 0, lastYaw: 0, speedX: 0, speedY: 0
  };

  // rotation cached once per frame instead of six trig calls per point
  const rot = { cy: 1, sy: 0, cp: 1, sp: 0, cr: 1, sr: 0, inside: 1 };
  function refreshRotation() {
    rot.cy = Math.cos(head.yaw); rot.sy = Math.sin(head.yaw);
    rot.cp = Math.cos(head.pitch); rot.sp = Math.sin(head.pitch);
    rot.cr = Math.cos(head.roll); rot.sr = Math.sin(head.roll);
    rot.inside = Math.max(0.35, Math.abs(rot.cy) + 0.6 * Math.abs(rot.sy));
  }

  function projectInto(out, x, y, z) {
    const x1 = x * rot.cy + z * rot.sy, z1 = -x * rot.sy + z * rot.cy;
    const y2 = y * rot.cp - z1 * rot.sp, z2 = y * rot.sp + z1 * rot.cp;
    const x3 = x1 * rot.cr - y2 * rot.sr, y3 = x1 * rot.sr + y2 * rot.cr;
    out[0] = head.x + x3; out[1] = head.y + y3 * CAM_COS + z2 * CAM_SIN; out[2] = z2;
    return out;
  }
  function project(x, y, z) { return projectInto([0, 0, 0], x, y, z); }

  // how much a surface point with outward normal (nx, 0, nz) faces the viewer
  function facing(nx, nz) {
    const v = -nx * rot.sy + nz * rot.cy;
    return clamp01((v + 0.12) / 0.32);
  }

  // ---------------------------------------------------------------- strokes
  function catmull(points, steps) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        const f = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }
  function quad(a, c, b, steps) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return out;
  }
  const mirror = pts => pts.map(([x, y]) => [-x, y]);
  const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

  // Facial features are designed in front view, then lifted onto the head.
  function featureStrokes(e) {
    const S = [];
    const add = (pts, w, closed = false) => S.push({ pts, w, closed });
    const open = Math.max(0, e.lid);
    for (const side of [-1, 1]) {
      const cx = side * 0.215, cy = -0.02, ew = 0.105;
      const inner = cx - side * ew, outer = cx + side * ew;
      const lift = 0.06 * open;
      const closed = open < 0.12;
      add(catmull([
        [inner, cy + 0.008],
        [cx - side * ew * 0.35, cy - lift - (closed ? -0.012 : 0.004)],
        [cx + side * ew * 0.35, cy - lift * 0.92 - (closed ? -0.012 : 0.004)],
        [outer, cy - 0.004]
      ], 6), 1.15);
      add(shift(catmull([
        [inner + side * 0.02, cy - 0.01],
        [cx - side * ew * 0.3, cy - lift - 0.028],
        [cx + side * ew * 0.35, cy - lift * 0.9 - 0.026],
        [outer - side * 0.012, cy - 0.016]
      ], 6), 0, -0.006 * (1 - open)), 0.35);
      const lowerDrop = closed ? 0.004 : 0.024 * Math.min(1, open * 1.3) + 0.006;
      add(quad([inner, cy + 0.008], [cx, cy + lowerDrop * 2], [outer, cy - 0.004], 10), 0.55);
      const f = clamp01((open - 0.2) / 0.9);
      const r = 0.036 * Math.min(1, open * 2.2);
      const ix = cx + e.gazeX * 0.03, iy = cy - 0.004 + e.gazeY * 0.02;
      const half = Math.PI * (0.48 + 0.42 * f);
      const iris = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI / 2 - half + (i / 16) * half * 2;
        iris.push([ix + Math.cos(a) * r, iy + Math.sin(a) * r]);
      }
      add(iris, 0.9);
      const browY = -0.15 - (e.brow + side * (e.browAsym || 0)) * 0.045;
      add(catmull([
        [cx - side * 0.118, browY + e.furrow * 0.034 + 0.006],
        [cx + side * 0.02, browY - 0.026],
        [cx + side * 0.138, browY + 0.012]
      ], 7), 0.8);
      add(catmull([
        [cx - side * 0.112, browY + e.furrow * 0.034 - 0.006],
        [cx + side * 0.02, browY - 0.042],
        [cx + side * 0.128, browY + 0.002]
      ], 7), 0.5);
    }
    const bridge = catmull([[-0.045, -0.09], [-0.048, 0.06], [-0.062, 0.19]], 5);
    add(bridge, 0.3); add(mirror(bridge), 0.3);
    const ala = catmull([[-0.07, 0.19], [-0.095, 0.235], [-0.075, 0.268], [-0.035, 0.258]], 5);
    add(ala, 0.6); add(mirror(ala), 0.6);
    add(quad([-0.035, 0.258], [0, 0.29], [0.035, 0.258], 8), 0.65);
    const my = 0.46, mw = 0.13, corner = e.mouth * 0.028, gap = e.open * 0.05;
    const cL = corner + (e.mouthAsym || 0) * 0.028, cR = corner - (e.mouthAsym || 0) * 0.028;
    add(catmull([[-mw, my + cL], [-0.055, my + 0.003], [0, my + 0.007], [0.055, my + 0.003], [mw, my + cR]], 6), 1.0);
    add(catmull([
      [-mw * 0.9, my + cL * 0.8 - 0.003], [-0.06, my - 0.024], [-0.018, my - 0.034],
      [0, my - 0.026], [0.018, my - 0.034], [0.06, my - 0.024], [mw * 0.9, my + cR * 0.8 - 0.003]
    ], 5), 0.7);
    add(quad([-mw * 0.72, my + 0.022 + cL * 0.5 + gap], [0, my + 0.078 + gap * 1.6], [mw * 0.72, my + 0.022 + cR * 0.5 + gap], 10), 0.6);
    add(quad([-0.06, 0.63], [0, 0.655], [0.06, 0.63], 6), 0.25);
    return S;
  }

  // Silhouette: for each height, the outermost points of the head's cross
  // section as seen from the current yaw. Front-on it is an oval; turned
  // side-on it becomes the profile — forehead, nose, lips, chin, back of head.
  const SIL_LEVELS = 40, SIL_STEPS = 56;
  const SIL_X = new Float32Array((SIL_LEVELS + 1) * SIL_STEPS);
  const SIL_Z = new Float32Array((SIL_LEVELS + 1) * SIL_STEPS);
  for (let i = 0; i <= SIL_LEVELS; i++) {
    const y = RIM_Y + (CHIN_Y - RIM_Y) * i / SIL_LEVELS;
    for (let k = 0; k < SIL_STEPS; k++) {
      const [x, z] = crossSection(k / SIL_STEPS * Math.PI * 2, y);
      SIL_X[i * SIL_STEPS + k] = x;
      SIL_Z[i * SIL_STEPS + k] = z;
    }
  }

  function silhouette() {
    const right = [], left = [];
    const cyw = rot.cy, syw = rot.sy;
    for (let i = 0; i <= SIL_LEVELS; i++) {
      const y = RIM_Y + (CHIN_Y - RIM_Y) * i / SIL_LEVELS;
      let best = -Infinity, worst = Infinity, bz = 0, wz = 0;
      for (let k = 0; k < SIL_STEPS; k++) {
        const x = SIL_X[i * SIL_STEPS + k], z = SIL_Z[i * SIL_STEPS + k];
        const x1 = x * cyw + z * syw;
        if (x1 > best) { best = x1; bz = -x * syw + z * cyw; }
        if (x1 < worst) { worst = x1; wz = -x * syw + z * cyw; }
      }
      right.push([best, y, bz]);
      left.push([worst, y, wz]);
    }
    return [...right, ...left.reverse()];
  }

  // project a list of rotated-space points (x1, y, z1) — silhouette points are
  // already yawed, so only pitch, roll and camera are applied
  function projectYawed(pts) {
    const cp = rot.cp, sp = rot.sp, cr = rot.cr, sr = rot.sr;
    return pts.map(([x1, y, z1]) => {
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;
      return [head.x + x3, head.y + y3 * CAM_COS + z2 * CAM_SIN, 1];
    });
  }

  const EAR = [[0.02, -0.15], [-0.05, -0.22], [-0.13, -0.06], [-0.09, 0.15], [0.0, 0.27]];

  // Fixed order and count of strokes so particles keep their place.
  function buildScene(e) {
    const strokes = [];
    strokes.push({ pts: projectYawed(silhouette()), w: 0.30, closed: false });

    for (const side of [1, -1]) {
      const ear = catmull(EAR, 6).map(([z, y], i, arr) => {
        const bulge = Math.sin(i / (arr.length - 1) * Math.PI) * 0.09;
        const x = side * (headW(y) + 0.02 + bulge);
        const [px, py] = project(x, y, z);
        return [px, py, facing(side, 0.25)];
      });
      strokes.push({ pts: ear, w: 0.16, closed: false });
    }

    for (const side of [1, -1]) {
      const neck = [];
      for (let i = 0; i <= 12; i++) {
        const y = 0.80 + 0.44 * i / 12;
        const r = 0.30 + 0.14 * Math.pow(i / 12, 1.6);
        const zc = -0.06;
        // cylinder silhouette under yaw
        const x1 = zc * Math.sin(head.yaw) + side * r;
        const cp = Math.cos(head.pitch), sp = Math.sin(head.pitch);
        const z1 = zc * Math.cos(head.yaw);
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        neck.push([head.x + x1, head.y + y2 * CAM_COS + z2 * CAM_SIN, 1]);
      }
      strokes.push({ pts: neck, w: 0.12, closed: false });
    }

    for (const f of featureStrokes(e)) {
      const pts = f.pts.map(([x, y]) => {
        const [lx, ly, lz, nx, nz] = lift(x, y);
        const [px, py] = project(lx, ly, lz);
        return [px, py, facing(nx, nz)];
      });
      strokes.push({ pts, w: f.w, closed: f.closed });
    }

    // measure on screen so particles spread evenly however the head turns
    for (const s of strokes) {
      const cum = [0];
      for (let i = 1; i < s.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]));
      s.cum = cum;
      s.len = cum[cum.length - 1] || 1e-6;
      // weights are fixed by the front-view design, not the current pose
    }
    return strokes;
  }

  function pointOn(s, u) {
    const d = u * s.len, cum = s.cum;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1e-6;
    const t = Math.max(0, Math.min(1, (d - cum[lo]) / seg));
    const a = s.pts[lo], b = s.pts[hi];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // ---------------------------------------------------------------- head choreography
  // The head eases between poses — front, three-quarter, full profile —
  // holding each for a few seconds and changing on a kick.
  const POSES = [
    { yaw: 0 }, { yaw: 0.55 }, { yaw: -0.55 }, { yaw: 1.42 }, { yaw: -1.42 },
    { yaw: 0.25 }, { yaw: -0.25 }, { yaw: 0.95 }, { yaw: -0.95 }
  ];

  function pickPose(now) {
    let pose;
    do { pose = POSES[Math.floor(Math.random() * POSES.length)]; } while (Math.abs(pose.yaw - head.tyaw) < 0.2);
    head.tyaw = pose.yaw;
    head.tpitch = (Math.random() - 0.5) * 0.24;
    head.troll = (Math.random() - 0.5) * 0.14;
    head.tx = (Math.random() - 0.5) * 0.55;
    head.ty = (Math.random() - 0.5) * 0.20;
    head.holdUntil = now + 3500 + Math.random() * 4000;
  }

  function resetHead(now) {
    refreshRotation();
    Object.assign(head, { x: 0, y: 0, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vyaw: 0, vpitch: 0, vroll: 0,
      tx: 0, ty: 0, tyaw: 0, tpitch: 0, troll: 0, holdUntil: now + 5000 });
  }

  function spring(key, vkey, tkey, dt, stiffness) {
    const k = stiffness, c = 2 * Math.sqrt(k);
    head[vkey] += ((head[tkey] - head[key]) * k - head[vkey] * c) * dt;
    head[key] += head[vkey] * dt;
  }

  function updateHead(dt, now, kick, active) {
    head.lastX = head.x; head.lastY = head.y; head.lastYaw = head.yaw;
    if (active && now > head.holdUntil && (kick || now > head.holdUntil + 2500)) pickPose(now);
    const stiffness = 2.2 + metrics.rms * 2.5;
    spring('x', 'vx', 'tx', dt, stiffness);
    spring('y', 'vy', 'ty', dt, stiffness);
    spring('yaw', 'vyaw', 'tyaw', dt, stiffness * 0.8);
    spring('pitch', 'vpitch', 'tpitch', dt, stiffness);
    spring('roll', 'vroll', 'troll', dt, stiffness);
    head.speedX = (head.x - head.lastX) / Math.max(dt, 1e-3) + (head.yaw - head.lastYaw) / Math.max(dt, 1e-3) * 0.35;
    head.speedY = (head.y - head.lastY) / Math.max(dt, 1e-3);
    refreshRotation();
  }

  // ---------------------------------------------------------------- particles
  // One pool. In the ether every particle drifts in unstructured chaos.
  // When the structure emerges, particles are recruited into three roles:
  // the torus stream, the wormhole funnel and (sparsely) the face.
  // The pool holds 3000, but only part of it is used on a small canvas:
  // ~1100 in the panel, up to 3000 in fullscreen. Chosen between cycles.
  const COUNT = 3000;
  let activeCount = 1100;
  let FACE_SLOTS = 520;
  let FUNNEL_COUNT = 1400;
  function chooseBudget(W, H) {
    activeCount = Math.round(Math.min(2400, Math.max(1100, W * H / 90)));
        FACE_SLOTS = Math.round(520 * Math.max(0.55, Math.min(1, activeCount / 2400)));
    FUNNEL_COUNT = Math.round(1400 * Math.min(1, activeCount / 2400));
  }
  const TORUS = { yc: 0.18, R: 1.06, rX: 0.98, rY: 1.32, tilt: 0.28 };
  const SPOKES = 26, RINGS = 12;

  let extentX = 2, extentY = 1.6;
  const particles = Array.from({ length: COUNT }, () => ({
    x: (Math.random() * 2 - 1) * 2, y: (Math.random() * 2 - 1) * 1.6,
    vx: 0, vy: 0,
    wander: Math.random() * Math.PI * 2,
    seed: Math.random(),
    role: 'ether', slot: -1,
    th: 0, ph: 0, jit: (Math.random() - 0.5) * 0.18, sp: 0.7 + Math.random() * 0.6,
    spoke: 0, ring: 0, d: 0, a: 0, fk: 'spoke',
    sx: NaN, sy: NaN
  }));

  const torusOut = [0, 0, 0, 0];
  function torusTarget(p, breath) {
    const R = TORUS.R * breath, rX = TORUS.rX * breath, rY = TORUS.rY * breath;
    const radial = Math.max(0.03, R + (rX + p.jit) * Math.cos(p.th));
    const up = (rY + p.jit) * Math.sin(p.th);
    const X = radial * Math.cos(p.ph), Z = radial * Math.sin(p.ph);
    torusOut[0] = X; torusOut[1] = TORUS.yc - up + Z * TORUS.tilt; torusOut[2] = Z; torusOut[3] = radial;
    return torusOut;
  }

  // funnel point in head space, rotated with the head
  // d 0→1: rim down to the throat. d 1→3: the stream keeps going — down
  // through the head, out under the chin, round the jaw and back up the
  // outside of the head, curling in over the rim to start again.
  const RIM_W = 0.5 * 1.024 * 0.96;
  function loopPoint(d) {
    const throatY = RIM_Y + tune.throatDepth;
    const outer = y => Math.max(headW(y), 0.3) + 0.18;
    if (d < 1.6) {
      const t = (d - 1) / 0.6;
      return [0.012 + 0.06 * t * t, throatY + (1.10 - throatY) * t];
    }
    if (d < 2) {
      const t = (d - 1.6) / 0.4;
      const e = Math.sin(t * Math.PI / 2);
      return [0.072 + (outer(1.04) - 0.072) * e, 1.10 - 0.06 * t];
    }
    const t = (d - 2);
    const topY = RIM_Y - 0.14;
    if (t < 0.85) {
      const u = t / 0.85;
      const y = 1.04 + (topY - 1.04) * (u * u * (3 - 2 * u));
      return [outer(y) + 0.05 * Math.sin(u * Math.PI), y];
    }
    const u = (t - 0.85) / 0.15;
    const s = u * u * (3 - 2 * u);
    return [outer(topY) + (RIM_W - outer(topY)) * s, topY + (RIM_Y - topY) * s];
  }

  const RIM_N = 360;
  const RIM_X = new Float32Array(RIM_N), RIM_Z = new Float32Array(RIM_N);
  for (let i = 0; i < RIM_N; i++) {
    const [x, z] = crossSection(i / RIM_N * Math.PI * 2, RIM_Y);
    RIM_X[i] = x; RIM_Z[i] = z;
  }
  const TWO_PI = Math.PI * 2;
  const funnelOut = [0, 0, 0];
  function funnelPoint(d, a) {
    if (d > 1) {
      const [r, y] = loopPoint(d);
      return projectInto(funnelOut, Math.cos(a) * r, y, Math.sin(a) * r * 0.98);
    }
    const idx = ((Math.round(a / TWO_PI * RIM_N) % RIM_N) + RIM_N) % RIM_N;
    const scale = Math.pow(1 - d, 1.5) + 0.024;
    const y = RIM_Y + tune.throatDepth * Math.pow(d, 2.1);
    return projectInto(funnelOut, RIM_X[idx] * scale * 0.96, y, RIM_Z[idx] * scale * 0.96);
  }

  function insideHead(x, y) {
    const ly = y - head.y;
    if (ly < RIM_Y + 0.06 || ly > 0.96) return false;
    return Math.abs(x - head.x) < headW(ly) * rot.inside;
  }

  // ---------------------------------------------------------------- emergence lifecycle
  let sceneTick = 0;
  const structure = { org: 0, state: 'ether', until: 0, nextAt: performance.now() + 12000, strokes: null, slots: null };

  function buildSlots(strokes) {
    const weights = strokes.map(s => s.len * s.w);
    const total = weights.reduce((a, b) => a + b, 0);
    const slots = [];
    strokes.forEach((s, si) => {
      const n = Math.max(1, Math.round(weights[si] / total * FACE_SLOTS));
      for (let j = 0; j < n; j++) {
        slots.push({
          s: si,
          u0: (j + Math.random()) / n,
          v: (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.06),
          off: (Math.random() - 0.5) * 0.07,
          offX: (Math.random() - 0.5) * 0.07
        });
      }
    });
    return slots;
  }

  function nearestFree(tx, ty) {
    let best = -1, bestD = Infinity;
    for (let n = 0; n < 160; n++) {
      const i = Math.floor(Math.random() * activeCount);
      const p = particles[i];
      if (p.role !== 'ether') continue;
      const d = (p.x - tx) ** 2 + (p.y - ty) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) {
      // sampling found nothing free: fall back to the first free particle
      for (let i = 0; i < activeCount; i++) if (particles[i].role === 'ether') return i;
    }
    return best;
  }

  function emerge(force) {
    if (structure.state !== 'ether' && !force) return;
    particles.forEach(p => { p.role = 'ether'; p.slot = -1; });
    resetHead(performance.now());
    sceneTick = 0;
    structure.strokes = buildScene(faceExpression());
    structure.slots = buildSlots(structure.strokes);

    // face: the particles already nearest each spot
    structure.slots.map((_, i) => i).sort(() => Math.random() - 0.5).forEach(si => {
      const slot = structure.slots[si];
      const [tx, ty] = pointOn(structure.strokes[slot.s], slot.u0);
      const i = nearestFree(tx, ty);
      if (i >= 0) { particles[i].role = 'face'; particles[i].slot = si; }
    });

    // wormhole: nearest to points on the funnel surface
    for (let k = 0; k < FUNNEL_COUNT; k++) {
      const spoke = k % 3 !== 0;   // two thirds stream round the loop
      // spoke particles travel the whole loop: half start in the funnel,
      // half somewhere on the way round the chin and back up
      const d = spoke ? (Math.random() < 0.35 ? Math.random() : 1 + Math.random() * 2) : Math.pow(((k >> 1) % RINGS) / RINGS, 0.75);
      const a = spoke ? ((k >> 1) % SPOKES) / SPOKES * Math.PI * 2 : Math.random() * Math.PI * 2;
      const [tx, ty] = funnelPoint(d, a);
      const i = nearestFree(tx, ty);
      if (i < 0) break;
      const p = particles[i];
      p.role = 'funnel'; p.fk = spoke ? 'spoke' : 'ring';
      p.d = d; p.a = a; p.spoke = (k >> 1) % SPOKES; p.ring = (k >> 1) % RINGS;
    }

    // everything else joins the torus, starting from where it already is
    for (let i = 0; i < activeCount; i++) {
      const p = particles[i];
      if (p.role !== 'ether') continue;
      p.role = 'torus';
      p.ph = Math.atan2(0.5, p.x) + (Math.random() - 0.5);
      p.th = Math.atan2(TORUS.yc - p.y, Math.abs(p.x) - TORUS.R);
    }

    structure.state = 'rising';
    structure.until = performance.now() + tune.holdSeconds * 1000 * (0.8 + Math.random() * 0.4);
  }

  function updateStructure(dt, now, kick) {
    if (settings.face === 'off' && structure.state !== 'ether') structure.state = 'falling';
    if (settings.face === 'always' && structure.state === 'ether') emerge(true);
    if (settings.face === 'always') structure.until = now + 60000;
    if (structure.state === 'ether' && settings.face === 'auto' && now > structure.nextAt && (kick || now > structure.nextAt + 8000)) emerge(false);

    if (structure.state === 'rising') {
      structure.org = Math.min(1, structure.org + dt / tune.fadeSeconds);
      if (structure.org >= 1) structure.state = 'holding';
    } else if (structure.state === 'holding') {
      if (now > structure.until) structure.state = 'falling';
    } else if (structure.state === 'falling') {
      structure.org = Math.max(0, structure.org - dt / tune.fadeSeconds);
      if (structure.org <= 0) {
        structure.state = 'ether';
        particles.forEach(p => { p.role = 'ether'; p.slot = -1; });
        structure.nextAt = now + tune.gapSeconds * 1000 * (0.65 + Math.random() * 0.7);
      }
    }
    updateHead(dt, now, kick, structure.state === 'holding');
    if (structure.strokes && structure.org > 0 && (sceneTick++ % 3) === 0) structure.strokes = buildScene(faceExpression());
  }

  // Each face stroke fades in and out on its own slow cycle, so the face
  // is only ever partly there — fragments that come and go.
  function strokeVisibility(si, time) {
    const a = Math.sin(time * (0.21 + (si % 7) * 0.037) + si * 2.17);
    const b = Math.sin(time * (0.13 + (si % 5) * 0.029) + si * 5.3);
    return clamp01(tune.faceShow + 0.45 * a * 0.7 + 0.45 * b * 0.7);
  }

  const ripples = [];
  const shocks = [];
  let prevPulse = 0, lastKickAt = 0, kickBoost = 0, last = performance.now();

  const BUCKETS = 8;
  const bucket = Array.from({ length: BUCKETS }, () => []);
  function push(b, x0, y0, x1, y1) {
    if (!(x0 === x0) || Math.abs(x1 - x0) + Math.abs(y1 - y0) > 60 * DPR) { x0 = x1; y0 = y1; }
    else {
      // keep streaks short so fast movers read as motion, not scratches
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), max = 9 * DPR;
      if (len > max) { x0 = x1 - dx / len * max; y0 = y1 - dy / len * max; }
    }
    bucket[b].push(x0, y0, x1, y1);
  }

  function draw(ctx, W, H) {
    const now = performance.now();
    const dt = Math.min(0.08, Math.max(0, (now - last) / 1000));
    last = now;
    metrics = visualizerMetrics;
    pulse = visualizerPulse;
    const ACCENT = accentRgb();
    if (!structure.nextAt) structure.nextAt = now + 10000;

    let kick = false;
    if (pulse >= 0.28 && prevPulse < 0.28 && metrics.bass > 0.08 && now - lastKickAt > 170) { kick = true; lastKickAt = now; }
    prevPulse = pulse;

    const profile = visualizerReactivityProfile();
    const amp = profile.gain / 1.12, punch = profile.transient / 2.2;
    const s = Math.min(H * 0.31, W * 0.26);
    const cx = W / 2, cy = H * 0.47;
    extentX = W / 2 / s; extentY = H / 2 / s;
    if (structure.state === 'ether') chooseBudget(W, H);

    if (kick) {
      kickBoost = Math.min(2.2, kickBoost + 0.9 * punch);
      ripples.push({ born: now, strength: clamp01((0.4 + pulse * 0.6) * punch) });
      // in the ether a kick bursts somewhere random
      shocks.push({ x: (Math.random() * 2 - 1) * extentX * 0.7, y: (Math.random() * 2 - 1) * extentY * 0.7, born: now, power: (0.6 + pulse) * punch });
    }
    kickBoost *= Math.exp(-dt * 4);
    while (ripples.length && now - ripples[0].born > 900) ripples.shift();
    while (shocks.length && now - shocks[0].born > 700) shocks.shift();

    chooseMood(dt, now);
    updateExpression(dt);
    updateStructure(dt, now, kick);

    const motion = reduceMotion ? 0.35 : 1;
    const time = now / 1000;
    const org = structure.org, orgS = org * org * (3 - 2 * org);
    // On the way out the wormhole goes first and fades more gradually:
    // it loosens, unwinds outward and dims well before the rest dissolves.
    const holeVis = structure.state === 'falling' ? Math.pow(orgS, 2.4) : orgS;
    const unwind = structure.state === 'falling' ? 1 - holeVis : 0;
    const breath = 1 + (Math.sin(time * 0.8) * 0.025 + metrics.bass * 0.05 * amp) * motion;
    const flow = (0.16 + metrics.rms * 0.55 * amp + kickBoost * 0.35) * motion;
    const chaos = (0.10 + metrics.mid * 0.45 + metrics.high * 0.30) * amp * motion * tune.etherChaos;
    const spin = time * (0.22 + metrics.mid * 0.3 * amp) * motion;
    const down = (0.10 + metrics.rms * 0.25 * amp + kickBoost * 0.35) * motion;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgb(3, 8, 10)';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
    glow.addColorStop(0, `rgba(${ACCENT}, ${0.04 + metrics.bass * 0.05 * amp + orgS * 0.03})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    for (const b of bucket) b.length = 0;

    for (let pi = 0; pi < activeCount; pi++) {
      const p = particles[pi];
      // ---- unstructured ether: layered swirl + random wander + kick bursts
      p.wander += (Math.random() - 0.5) * dt * 6;
      const n1 = Math.sin(p.x * 1.7 + time * 0.47 + Math.sin(p.y * 2.3 - time * 0.31));
      const n2 = Math.sin(p.y * 1.4 - time * 0.39 + Math.sin(p.x * 2.9 + time * 0.23));
      let ax = Math.cos(n1 * Math.PI + p.seed * 2) * 0.7 + Math.cos(p.wander) * 0.5;
      let ay = Math.sin(n2 * Math.PI + p.seed * 3) * 0.7 + Math.sin(p.wander) * 0.5;
      for (const sh of shocks) {
        const dx = p.x - sh.x, dy = p.y - sh.y;
        const r2 = dx * dx + dy * dy;
        const age = (now - sh.born) / 700;
        const f = sh.power * (1 - age) * Math.exp(-r2 * 3) * 4;
        const r = Math.sqrt(r2) + 0.05;
        ax += dx / r * f; ay += dy / r * f;
      }
      if (orgS > 0.05) {
        // the moving head pushes the surrounding ether out of its way
        const dx = p.x - head.x, dy = p.y - head.y;
        const near = Math.exp(-(dx * dx + dy * dy) * 1.1) * orgS;
        ax += head.speedX * near * 2.2 / Math.max(chaos, 0.05);
        ay += head.speedY * near * 2.2 / Math.max(chaos, 0.05);
      }
      p.vx += (ax * chaos - p.vx) * Math.min(1, dt * 2.5);
      p.vy += (ay * chaos - p.vy) * Math.min(1, dt * 2.5);
      if (p.role === 'funnel' && unwind > 0) {
        // drift outward and upward out of the throat as it dissolves
        const dx = p.x - head.x, dy = p.y - (head.y + RIM_Y);
        const r = Math.hypot(dx, dy) + 0.05;
        p.vx += (dx / r * 0.35 + Math.cos(p.wander) * 0.15) * unwind * dt * 3;
        p.vy += (dy / r * 0.35 - 0.12 + Math.sin(p.wander) * 0.15) * unwind * dt * 3;
      }
      // density sliders: a share of wormhole particles in each section is
      // simply let go to drift as ether until it reaches a denser section
      const funnelKeep = p.role !== 'funnel' ||
        ((p.seed * 7.13) % 1) < (p.d <= 1 ? tune.funnelDensity : p.d < 2 ? tune.columnDensity : tune.outerDensity);
      const free = 1 - (p.role === 'ether' ? 0 : p.role === 'funnel' ? (funnelKeep ? holeVis : 0) : orgS);
      p.x += p.vx * dt * free;
      p.y += p.vy * dt * free;

      // ---- structure pull
      let target = null, pull = 0, b = 1;
      if (p.role === 'torus') {
        const radial = TORUS.R + (TORUS.rX + p.jit) * Math.cos(p.th);
        p.th += dt * flow * p.sp * (0.55 + 0.9 * clamp01(-Math.cos(p.th)));
        p.ph += dt * (0.10 + metrics.mid * 0.25 * amp) / (Math.abs(radial) + 0.12) * 0.35 * motion;
        const t = torusTarget(p, breath);
        t[0] += head.x; t[1] += head.y;
        target = t; pull = orgS;
        b = t[2] > 0 ? 2 : 1;
        if (t[3] < 0.32 && t[1] > RIM_Y - 0.5 && t[1] < RIM_Y + 0.5) b = 2;
        if (t[3] < 0.6 && insideHead(t[0], t[1])) b = 0;
      } else if (p.role === 'funnel') {
        if (p.fk === 'spoke') {
          p.d += dt * down * p.sp * (p.d < 1 ? 0.4 + p.d * 1.6 : 1.4);
          if (p.d >= 3) p.d -= 3;
          p.a = spin + p.spoke / SPOKES * Math.PI * 2 + p.d * 0.9 + (p.seed - 0.5) * 0.22;
        } else {
          p.a += dt * (0.25 + 0.9 * p.d) * p.sp * (0.6 + metrics.mid * amp) * motion;
        }
        const ang = p.fk === 'ring' ? p.a + spin : p.a;
        target = funnelPoint(p.d, ang);
        // loosen the funnel: each particle strays from the grid and drifts
        const fn = (0.03 + metrics.high * 0.025 * amp) * (p.d > 1 ? tune.loopNoise : tune.funnelNoise);
        target[0] += Math.sin(time * 1.4 + p.seed * 19) * fn + (p.seed - 0.5) * 0.05;
        target[1] += Math.cos(time * 1.9 + p.seed * 23) * fn * 0.8 + (p.jit) * 0.12;
        // fade towards the throat: lower particles loosen and dim
        const deep = p.d <= 1 ? p.d * p.d : p.d < 1.6 ? 1 : 0;
        pull = holeVis * tune.funnelGrip * (1 - tune.throatFade * deep * 0.85);
        b = target[2] < 0 && (p.d < 0.5 || p.d > 1.6) ? 4 : 5;
        if (p.d > 1 && p.d < 1.55) b = 4;   // inside the skull: dimmer, but the stream stays continuous
        if (p.seed < tune.throatFade * deep) b = 4;
        if (p.d > 1 && b === 5) b = 7;
        if (!funnelKeep) { target = null; b = 1; }
        if (p.fk === 'ring') for (const rip of ripples) {
          const age = (now - rip.born) / 700;
          if (age < 1 && Math.abs(age * RINGS - p.ring) < 1.2) b = 6;
        }
      } else if (p.role === 'face' && structure.strokes) {
        const slot = structure.slots[p.slot];
        const stroke = structure.strokes[slot.s];
        let u = slot.u0 + slot.v * time;
        u = stroke.closed ? ((u % 1) + 1) % 1 : 1 - Math.abs(((u % 2) + 2) % 2 - 1);
        const [tx, ty, facingVis] = pointOn(stroke, u);
        const vis = strokeVisibility(slot.s, time) * facingVis;
        // Lots of noise: each particle sits loosely around its line and
        // wanders, so the face is only ever suggested, never drawn.
        const n = (0.022 + metrics.high * 0.02 * amp) * tune.faceNoise;
        const wobbleX = slot.offX + Math.sin(time * 1.3 + p.seed * 17) * n + Math.sin(time * 3.1 + p.seed * 5) * n * 0.5;
        const wobbleY = slot.off + Math.cos(time * 1.7 + p.seed * 13) * n + Math.sin(time * 2.6 + p.seed * 9) * n * 0.5;
        target = [tx + wobbleX, ty + wobbleY];
        pull = orgS * vis * tune.faceGrip;   // never fully locked: the ether keeps tugging
        b = 3;
      }

      if (target) {
        const k = 1 - Math.exp(-dt * 3.2);
        p.x += (target[0] - p.x) * k * pull;
        p.y += (target[1] - p.y) * k * pull;
      }

      // stray ether particles come back in from somewhere else
      if (Math.abs(p.x) > extentX + 0.2 || Math.abs(p.y) > extentY + 0.2) {
        p.x = (Math.random() * 2 - 1) * extentX;
        p.y = (Math.random() * 2 - 1) * extentY;
        p.sx = NaN;
      }

      if (p.role === 'ether' || (p.role === 'funnel' ? holeVis < 0.04 : orgS < 0.15)) b = 1;
      const X = cx + p.x * s, Y = cy + p.y * s;
      push(b, p.sx, p.sy, X, Y);
      p.sx = X; p.sy = Y;
    }

    const style = [
      [0.06 * tune.torusBright, 1.0],
      [(0.30 * amp + metrics.rms * 0.2) * (orgS > 0.15 ? tune.torusBright : tune.etherBright), 1.05],
      [((0.30 + 0.32 * orgS) * amp + metrics.rms * 0.2) * tune.torusBright, 1.2],
      [(0.20 + orgS * 0.32 + metrics.high * 0.12) * tune.faceBright, 1.05],
      [(0.16 * holeVis + 0.04) * tune.funnelBright, 1.0],
      [(0.62 * holeVis + 0.06) * tune.funnelBright, 1.25],
      [(0.95 * holeVis + 0.05) * tune.funnelBright, 1.5],
      [(0.62 * holeVis + 0.06) * tune.loopBright, 1.25]
    ];
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';
    for (let b = 0; b < BUCKETS; b++) {
      const list = bucket[b];
      if (!list.length) continue;
      ctx.strokeStyle = `rgba(${ACCENT}, ${Math.min(1, style[b][0])})`;
      ctx.lineWidth = style[b][1] * DPR;
      ctx.beginPath();
      for (let i = 0; i < list.length; i += 4) {
        ctx.moveTo(list[i], list[i + 1]);
        ctx.lineTo(list[i + 2] + 0.01, list[i + 3]);
      }
      ctx.stroke();
    }

  }

        return { draw };
    })();

    function drawAetherStyle(
        context,
        width,
        height
    ) {
        aetherVisual.draw(
            context,
            width,
            height
        );
    }

    function stopVisualizer() {
        if (
            visualizerRaf
        ) {
            cancelAnimationFrame(
                visualizerRaf
            );

            visualizerRaf =
                0;
        }

        /*
            Do not release the passive audio tap here. Track Analysis uses the
            same captured stream even when the visual canvas is switched off.
        */
    }

    function applyVisualizerVisibility() {
        const visual =
            document.getElementById(
                'strata-visualizer'
            );

        if (!visual) {
            return;
        }

        visual.hidden =
            !(
                visualizerEnabled &&
                expanded &&
                !utilityPanelOpen
            );

        const analysisPanel =
            document.getElementById(
                'strata-track-analysis'
            );

        if (analysisPanel) {
            analysisPanel.hidden =
                !(
                    expanded &&
                    !utilityPanelOpen
                );
        }

        if (
            !visual.hidden
        ) {
            startVisualizer();
        }

        if (
            expanded &&
            !utilityPanelOpen
        ) {
            attachVisualizerAudio();
        }
    }

    function setVisualizerEnabled(
        enabled
    ) {
        visualizerEnabled =
            Boolean(
                enabled
            );

        GM_setValue(
            VISUALIZER_ENABLED_KEY,
            visualizerEnabled
        );

        if (
            visualizerEnabled
        ) {
            startVisualizer();

            attachVisualizerAudio();

        } else {
            stopVisualizer();
        }

        applyVisualizerVisibility();
    }

    function drawVisualizer(
        timestamp
    ) {
        visualizerRaf =
            0;

        if (
            !visualizerEnabled ||
            !expanded ||
            utilityPanelOpen ||
            document.hidden
        ) {
            return;
        }

        /*
            Frame-rate cap. The visualizer is smooth to the eye at 30fps but
            costs roughly half the CPU/GPU of an uncapped (60/120fps) loop.
            If this frame arrived sooner than the target interval, skip the
            expensive drawing and reschedule. visualizerLastFrameTime (used
            below for motion delta timing) is left untouched so animation
            speed stays correct regardless of the cap.
        */

        if (
            visualizerLastRenderTime &&
            timestamp -
                visualizerLastRenderTime <
                VISUALIZER_MIN_FRAME_MS
        ) {
            visualizerRaf =
                requestAnimationFrame(
                    drawVisualizer
                );

            return;
        }

        visualizerLastRenderTime =
            timestamp;

        const canvas =
            cachedElementById(
                'strata-visualizer-canvas'
            );

        if (!canvas) {
            return;
        }

        if (
            visualizerCanvasElement !==
                canvas
        ) {
            visualizerCanvasElement =
                canvas;

            visualizerCanvasContext =
                canvas.getContext(
                    '2d'
                );
        }

        const context =
            visualizerCanvasContext;

        if (!context) {
            return;
        }

        ensureVisualizerCanvasMetrics(
            canvas
        );

        if (
            visualizerCanvasCssWidth <
                10 ||
            visualizerCanvasCssHeight <
                10
        ) {
            visualizerRaf =
                requestAnimationFrame(
                    drawVisualizer
                );

            return;
        }

        const dpr =
            Math.min(
                1,
                window.devicePixelRatio ||
                    1
            );

        const pixelWidth =
            Math.max(
                1,
                Math.round(
                    visualizerCanvasCssWidth *
                    dpr
                )
            );

        const pixelHeight =
            Math.max(
                1,
                Math.round(
                    visualizerCanvasCssHeight *
                    dpr
                )
            );

        if (
            canvas.width !==
                pixelWidth ||
            canvas.height !==
                pixelHeight
        ) {
            canvas.width =
                pixelWidth;

            canvas.height =
                pixelHeight;
        }

        context.setTransform(
            dpr,
            0,
            0,
            dpr,
            0,
            0
        );

        const width =
            visualizerCanvasCssWidth;

        const height =
            visualizerCanvasCssHeight;

        const deltaSeconds =
            visualizerLastFrameTime
                ? Math.min(
                    0.08,
                    Math.max(
                        0,
                        (
                            timestamp -
                            visualizerLastFrameTime
                        ) /
                        1000
                    )
                )
                : 1 /
                    60;

        visualizerLastFrameTime =
            timestamp;

        const video =
            currentMainVideo();

        if (
            video &&
            visualizerVideo !==
                video &&
            visualizerMode ===
                'AUDIO'
        ) {
            releaseVisualizerAudio();
        }

        if (
            video &&
            !video.paused &&
            !visualizerAnalyser
        ) {
            attachVisualizerAudio();
        }

        updateVisualizerMetrics(
            deltaSeconds
        );

        // Aether paints its own backdrop, so skip the grid underneath it.
        if (
            visualizerStyle !==
                'aether'
        ) {
            drawVisualizerBackground(
                context,
                width,
                height
            );
        }

        switch (
            visualizerStyle
        ) {
            case 'spectrum':
                drawSpectrumStyle(
                    context,
                    width,
                    height
                );
                break;

            case 'cascade':
                drawCascadeStyle(
                    context,
                    width,
                    height,
                    timestamp
                );
                break;

            case 'orbit':
                drawOrbitStyle(
                    context,
                    width,
                    height
                );
                break;

            case 'phase':
                drawPhaseStyle(
                    context,
                    width,
                    height,
                    video
                );
                break;

            case 'aether':
                drawAetherStyle(
                    context,
                    width,
                    height
                );
                break;

            case 'vector':
            default:
                drawVectorStyle(
                    context,
                    width,
                    height,
                    video
                );
                break;
        }

        updateVisualizerHud();

        visualizerRaf =
            requestAnimationFrame(
                drawVisualizer
            );
    }

    function startVisualizer() {
        if (
            !visualizerEnabled ||
            visualizerRaf
        ) {
            return;
        }

        visualizerLastFrameTime =
            0;

        visualizerLastRenderTime =
            0;

        visualizerRaf =
            requestAnimationFrame(
                drawVisualizer
            );
    }

    // ============================================================
    // TRACK ANALYSIS — BPM / KEY / SCALE / CAMELOT
    //
    // All values are estimates calculated locally from the same passive
    // captured audio stream used by the visual engine. No external metadata
    // service or network lookup is involved.
    // ============================================================

    function resetTrackAnalysis(
        trackId =
            currentVideoId()
    ) {
        if ( v2 && v2.trackId && v2.trackId !== ( trackId || null ) ) {
            v2FlushOnLeave();
        }

        trackAnalysisTrackId =
            trackId ||
            null;









        trackAnalysisBpm =
            null;

        trackAnalysisBpmConfidence =
            0;

        trackAnalysisKeyIndex =
            null;

        trackAnalysisScale =
            null;

        trackAnalysisKeyConfidence =
            0;


        if (
            trackAnalysisPreviousTempoSpectrum
        ) {
            trackAnalysisPreviousTempoSpectrum
                .fill(
                    0
                );
        }

        restoreTrackAnalysisFromMemory(
            trackAnalysisTrackId
        );

        v2Reset( trackAnalysisTrackId );
        if ( v2.restored ) {
            v2Publish();
        }

        updateTrackAnalysisUI();
    }


    function formatTrackAnalysisConfidence(
        value
    ) {
        return `${Math.round(
            clamp01(
                value
            ) *
                100
        )}%`;
    }

    /*
        BPM display formatting.

        The tempo detector already produces a confidence value (0..1) from
        how sharply the winning BPM beats its nearest competitor. Rather
        than always printing a single decimal that may be wrong, we report
        the detector's actual certainty:

          - High confidence  -> a single rounded BPM, e.g. "127".
          - Lower confidence -> a range that widens as certainty drops,
            e.g. "123-128", honestly signalling the detector isn't sure of
            the exact value but has bracketed it.

        Thresholds are intentionally simple and will likely need tuning
        against real tracks: if ranges appear too often, raise
        BPM_CONFIDENT_THRESHOLD; if a shown range feels too wide/narrow,
        adjust BPM_RANGE_MAX_HALFWIDTH.
    */

    const BPM_CONFIDENT_THRESHOLD =
        0.80;

    const BPM_RANGE_MAX_HALFWIDTH =
        3;

    function formatBpmDisplay(
        bpm,
        confidence
    ) {
        if (
            !Number.isFinite(
                bpm
            )
        ) {
            return '—';
        }

        const conf =
            Number.isFinite(
                confidence
            )
                ? clamp01(
                    confidence
                )
                : 0;

        if (
            conf >=
                BPM_CONFIDENT_THRESHOLD
        ) {
            return String(
                Math.round(
                    bpm
                )
            );
        }

        /*
            Map confidence in [MIN_CONFIDENCE .. CONFIDENT_THRESHOLD] to a
            half-width in [1 .. BPM_RANGE_MAX_HALFWIDTH]. Lower confidence
            -> wider bracket.
        */

        const span =
            Math.max(
                0.0001,
                BPM_CONFIDENT_THRESHOLD -
                    TRACK_ANALYSIS_BPM_MIN_CONFIDENCE
            );

        const t =
            clamp01(
                (
                    BPM_CONFIDENT_THRESHOLD -
                        conf
                ) /
                    span
            );

        const halfWidth =
            Math.max(
                1,
                Math.round(
                    1 +
                        t *
                            (
                                BPM_RANGE_MAX_HALFWIDTH -
                                    1
                            )
                )
            );

        const centre =
            Math.round(
                bpm
            );

        const low =
            centre -
                halfWidth;

        const high =
            centre +
                halfWidth;

        return `${low}-${high}`;
    }

    function updateTrackAnalysisUI() {
        const panel =
            document.getElementById(
                'strata-track-analysis'
            );

        if (!panel) {
            return;
        }

        v2RenderAnalysisUI( panel );
    }





    function trackAnalysisScaleDefinition(
        id
    ) {
        return (
            TRACK_ANALYSIS_SCALE_DEFINITIONS.find(
                definition =>
                    definition.id ===
                        id
            ) ||
            null
        );
    }






    function sampleTrackAnalysis() {
        if (
            document.hidden ||
            adRecentlyActive()
        ) {
            return;
        }

        /*
            The analysis engine keeps listening while the panel is
            collapsed (it is light: ~3 extra FFTs per second), so the
            saved result covers the whole track. It only redraws the
            readout when the panel is on screen.
        */
        v2Tick();
    }

    function startTrackAnalysis() {
        if (
            trackAnalysisTimer
        ) {
            return;
        }

        resetTrackAnalysis(
            currentVideoId()
        );

        trackAnalysisTimer =
            window.setInterval(
                sampleTrackAnalysis,
                TRACK_ANALYSIS_SAMPLE_MS
            );

        attachVisualizerAudio();
    }

    /* STRATA_ANALYSIS_V2_BEGIN */
    // ============================================================
    // TRACK ANALYSIS ENGINE v2 (v8.5.97)
    //
    // Runs on the same passive captured audio as the visual engine.
    // Nothing leaves the browser.
    //
    // TEMPO  A dedicated low-pass (kick band) energy envelope is
    //        timestamped against the video's media clock, so timer
    //        jitter, pauses and ads never smear the beat grid. Each
    //        20 s block is scored with a phase-coherent comb across
    //        60–200 BPM in 0.05 steps; blocks are summed over the
    //        whole track, refined, then snapped to a whole BPM when
    //        the evidence supports it.
    // KEY    A dedicated high-resolution spectrum is cleaned with a
    //        harmonic/percussive split (time-median vs frequency-
    //        median soft mask). Once the beat grid is known, snapshots
    //        are taken half-way between kicks. Spectral peaks give a
    //        tuning estimate (cents off A440) and a tuning-corrected
    //        chroma, which accumulates over the full track and is
    //        matched against EDM-derived key profiles (Faraldo edma).
    //        Weak or flat tonal evidence is reported as "No clear key".
    // MEMORY The full-track chroma, tuning and tempo are remembered,
    //        so replays continue refining instead of starting over.
    // ============================================================

    const ANALYSIS_LOG_KEY =
        'strata_v8597_analysis_log';

    const ANALYSIS_LOG_LIMIT = 40;


    const V2_EDMA_MAJOR = [ 1.00, 0.29, 0.50, 0.40, 0.60, 0.56, 0.32, 0.80, 0.31, 0.45, 0.42, 0.39 ];
    const V2_EDMA_MINOR = [ 1.00, 0.31, 0.44, 0.58, 0.33, 0.49, 0.29, 0.78, 0.43, 0.29, 0.53, 0.32 ];
    const V2_MINOR_BIAS = 0.01;

    const V2_BPM_MIN = 40; // evidence grid floor (sub-harmonic support)
    const V2_BPM_REPORT_MIN = 60;
    const V2_BPM_MAX = 200;
    const V2_BPM_STEP = 0.05;
    const V2_BPM_COUNT = Math.round( ( V2_BPM_MAX - V2_BPM_MIN ) / V2_BPM_STEP ) + 1;
    const V2_TEMPO_BLOCK_SECONDS = 20;
    const V2_TEMPO_ESTIMATE_MS = 3000;
    const V2_KEY_ESTIMATE_MS = 2000;
    const V2_UI_MS = 500;
    const V2_REMEMBER_MS = 10000;

    const V2_KEY_PROVISIONAL_SECONDS = 10;
    const V2_KEY_FIRM_SECONDS = 45;
    const V2_NO_KEY_SECONDS = 40;
    const V2_FINAL_COVERAGE = 0.8;
    const V2_FINAL_SECONDS = 330;

    const V2_HARMONIC_FFT = 16384;
    const V2_KICK_FFT = 4096;
    const V2_HPSS_FRAMES = 5;
    const V2_FREQ_MEDIAN_HALF = 12;
    const V2_LOW_HZ = 45;
    const V2_HIGH_HZ = 5000;

    const V2_NOTE_NAMES = [ 'C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B' ];

    const v2Omega0 = 2 * Math.PI * V2_BPM_MIN / 60;
    const v2OmegaStep = 2 * Math.PI * V2_BPM_STEP / 60;

    let v2 = null;
    let v2Nodes = null;

    function v2NewState( trackId ) {
        return {
            trackId: trackId || null,
            // timing
            lastMediaTime: null,
            seconds: 0,
            priorSeconds: 0,
            // tempo
            kickRef: 0,
            kickPrevLevel: null,
            blockStart: null,
            blockRe: new Float64Array( V2_BPM_COUNT ),
            blockIm: new Float64Array( V2_BPM_COUNT ),
            blockW: 0,
            prevRe: null,
            prevIm: null,
            tempoTotal: new Float64Array( V2_BPM_COUNT ),
            tempoBlocks: 0,
            tempoSeconds: 0,
            lastTempoEstimateAt: 0,
            bpm: null,
            bpmRaw: null,
            bpmConfidence: 0,
            bpmHalfRatio: null,
            bpmDoubleRatio: null,
            beatPhase: null,
            beatPeriod: null,
            // key
            hpssRing: null,
            hpssCount: 0,
            hpssIndex: 0,
            lastSnapshotAt: -Infinity,
            snapshots: 0,
            gatedSnapshots: 0,
            chroma: new Float64Array( 12 ),
            chromaHigh: new Float64Array( 12 ),
            chromaWeight: 0,
            tonalSum: 0,
            tonalFrames: 0,
            tuneRe: 0,
            tuneIm: 0,
            tuneW: 0,
            lastKeyEstimateAt: 0,
            keyIndex: null,
            keyScale: null,
            keyConfidence: 0,
            keyR: 0,
            keyRunnerUp: null,
            keyRunnerUpR: 0,
            keyState: 'learning',
            noKey: false,
            // memory
            restored: false,
            restoredFinal: false,
            final: false,
            lastRememberAt: 0,
            lastUiAt: 0,
            duration: 0
        };
    }

    function v2EnsureNodes() {
        if ( !visualizerContext || !visualizerSource ) {
            return false;
        }

        if ( v2Nodes && v2Nodes.context === visualizerContext && v2Nodes.source === visualizerSource ) {
            return true;
        }

        try {
            const context = visualizerContext;

            const lowpass = context.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.frequency.value = 150;
            lowpass.Q.value = 0.707;

            const kick = context.createAnalyser();
            kick.fftSize = V2_KICK_FFT;
            kick.smoothingTimeConstant = 0;

            const harmonic = context.createAnalyser();
            harmonic.fftSize = V2_HARMONIC_FFT;
            harmonic.smoothingTimeConstant = 0;
            harmonic.minDecibels = -120;
            harmonic.maxDecibels = -10;

            visualizerSource.connect( lowpass );
            lowpass.connect( kick );
            visualizerSource.connect( harmonic );

            const binHz = context.sampleRate / V2_HARMONIC_FFT;
            const startBin = Math.max( 2, Math.floor( V2_LOW_HZ / binHz ) );
            const endBin = Math.min( harmonic.frequencyBinCount - 3, Math.ceil( V2_HIGH_HZ / binHz ) );

            v2Nodes = {
                context,
                source: visualizerSource,
                kick,
                harmonic,
                kickBuffer: new Float32Array( kick.fftSize ),
                spectrum: new Float32Array( harmonic.frequencyBinCount ),
                binHz,
                startBin,
                endBin,
                bandSize: endBin - startBin + 1,
                windowCentre: 0.5 * V2_HARMONIC_FFT / context.sampleRate,
                amp: new Float64Array( endBin - startBin + 1 ),
                percussive: new Float64Array( endBin - startBin + 1 ),
                scratch: new Float64Array( 2 * V2_FREQ_MEDIAN_HALF + 1 )
            };

            return true;
        } catch ( error ) {
            console.debug( '[STRATA] analysis v2 nodes unavailable', error );
            v2Nodes = null;
            return false;
        }
    }

    // ---------- small numeric helpers ----------

    function v2Quickselect( values, length, k ) {
        let left = 0;
        let right = length - 1;

        while ( right > left ) {
            const pivot = values[ ( left + right ) >> 1 ];
            let i = left;
            let j = right;

            while ( i <= j ) {
                while ( values[ i ] < pivot ) {
                    i++;
                }
                while ( values[ j ] > pivot ) {
                    j--;
                }
                if ( i <= j ) {
                    const swap = values[ i ];
                    values[ i ] = values[ j ];
                    values[ j ] = swap;
                    i++;
                    j--;
                }
            }

            if ( k <= j ) {
                right = j;
            } else if ( k >= i ) {
                left = i;
            } else {
                break;
            }
        }

        return values[ k ];
    }

    function v2Pearson( chroma, profile, tonic ) {
        let meanA = 0;
        let meanB = 0;

        for ( let i = 0; i < 12; i++ ) {
            meanA += chroma[ ( tonic + i ) % 12 ];
            meanB += profile[ i ];
        }

        meanA /= 12;
        meanB /= 12;

        let numerator = 0;
        let energyA = 0;
        let energyB = 0;

        for ( let i = 0; i < 12; i++ ) {
            const a = chroma[ ( tonic + i ) % 12 ] - meanA;
            const b = profile[ i ] - meanB;
            numerator += a * b;
            energyA += a * a;
            energyB += b * b;
        }

        const denominator = Math.sqrt( energyA * energyB );
        return denominator > 1e-12 ? numerator / denominator : 0;
    }

    function v2KeyLabel( index, scale ) {
        if ( !Number.isInteger( index ) ) {
            return '—';
        }
        const camelot = scale === 'minor' ? TRACK_ANALYSIS_CAMELOT_MINOR[ index ] : TRACK_ANALYSIS_CAMELOT_MAJOR[ index ];
        return `${V2_NOTE_NAMES[ index ]} ${scale === 'minor' ? 'min' : 'maj'} (${camelot})`;
    }

    // ---------- reset / restore ----------

    function v2Reset( trackId ) {
        v2 = v2NewState( trackId );

        const entry = trackId ? trackAnalysisMemory?.[ trackId ] : null;

        if ( !entry || entry.e !== 2 ) {
            return;
        }

        v2.restored = true;
        v2.restoredFinal = Boolean( entry.f );
        v2.final = Boolean( entry.f );
        v2.priorSeconds = Number( entry.d ) || 0;

        if ( Array.isArray( entry.c ) && entry.c.length === 12 && Number( entry.cw ) > 0 ) {
            let total = 0;
            for ( const value of entry.c ) {
                total += Number( value ) || 0;
            }
            if ( total > 0 ) {
                for ( let i = 0; i < 12; i++ ) {
                    v2.chroma[ i ] = ( Number( entry.c[ i ] ) || 0 ) / total * entry.cw;
                }
                v2.chromaWeight = Number( entry.cw );

                // High-band (>100 Hz) evidence is stored on the same scale.
                if ( Array.isArray( entry.ch ) && entry.ch.length === 12 ) {
                    for ( let i = 0; i < 12; i++ ) {
                        v2.chromaHigh[ i ] = ( Number( entry.ch[ i ] ) || 0 ) / total * entry.cw;
                    }
                }
            }
        }

        if ( Number.isFinite( entry.tu ) && Number( entry.tw ) > 0 ) {
            const angle = 2 * Math.PI * entry.tu / 100;
            v2.tuneRe = Math.cos( angle ) * entry.tw;
            v2.tuneIm = Math.sin( angle ) * entry.tw;
            v2.tuneW = Number( entry.tw );
        }

        v2.tonalSum = Number( entry.ts ) || 0;
        v2.tonalFrames = Number( entry.tf ) || 0;
        v2.noKey = Boolean( entry.nk );

        if ( Number.isFinite( entry.b ) ) {
            v2.bpm = entry.b;
            v2.bpmConfidence = Number( entry.bc ) || 0.6;
            v2.tempoSeconds = Number( entry.bd ) || 0;
        }

        if ( Number.isInteger( entry.k ) ) {
            v2.keyIndex = entry.k;
            v2.keyScale = entry.s === 'major' ? 'major' : 'minor';
            v2.keyConfidence = Number( entry.kc ) || 0.6;
            v2.keyState = entry.f ? 'final' : 'firm';
        } else if ( entry.nk ) {
            v2.keyState = 'none';
        }
    }

    // ---------- tempo ----------

    function v2SampleKick( mediaTime ) {
        const nodes = v2Nodes;
        nodes.kick.getFloatTimeDomainData( nodes.kickBuffer );

        let energy = 0;
        const buffer = nodes.kickBuffer;
        for ( let i = 0; i < buffer.length; i++ ) {
            energy += buffer[ i ] * buffer[ i ];
        }
        energy /= buffer.length;

        v2.kickRef = Math.max( energy, v2.kickRef * 0.9995 );

        const level = Math.log1p( 200 * energy / ( v2.kickRef + 1e-12 ) );
        const previous = v2.kickPrevLevel;
        v2.kickPrevLevel = level;

        if ( previous === null ) {
            return;
        }

        const onset = level - previous;

        if ( v2.blockStart === null || mediaTime < v2.blockStart - 0.5 ) {
            v2FinishTempoBlock( true );
            v2.blockStart = mediaTime;
        } else if ( mediaTime - v2.blockStart >= V2_TEMPO_BLOCK_SECONDS ) {
            v2FinishTempoBlock( false );
            v2.blockStart = mediaTime;
        }

        if ( onset <= 0 ) {
            return;
        }

        // Rotating phasor across the BPM grid: two trig calls per onset.
        const step = v2OmegaStep * mediaTime;
        const stepCos = Math.cos( step );
        const stepSin = Math.sin( step );
        let c = Math.cos( v2Omega0 * mediaTime );
        let s = Math.sin( v2Omega0 * mediaTime );
        const re = v2.blockRe;
        const im = v2.blockIm;

        for ( let k = 0; k < V2_BPM_COUNT; k++ ) {
            re[ k ] += onset * c;
            im[ k ] += onset * s;
            const nextC = c * stepCos - s * stepSin;
            s = s * stepCos + c * stepSin;
            c = nextC;
        }

        v2.blockW += onset;
    }

    function v2FinishTempoBlock( discontinuity ) {
        if ( v2.blockStart === null ) {
            return;
        }

        const duration = ( v2.lastMediaTime ?? v2.blockStart ) - v2.blockStart;

        if ( v2.blockW > 1e-6 && ( !discontinuity || duration >= 8 ) ) {
            const weight = Math.min( 1, Math.max( 0, duration ) / V2_TEMPO_BLOCK_SECONDS );
            for ( let k = 0; k < V2_BPM_COUNT; k++ ) {
                v2.tempoTotal[ k ] += weight * Math.hypot( v2.blockRe[ k ], v2.blockIm[ k ] ) / v2.blockW;
            }
            v2.tempoBlocks += weight;
            v2.prevRe = v2.blockRe;
            v2.prevIm = v2.blockIm;
            v2.blockRe = new Float64Array( V2_BPM_COUNT );
            v2.blockIm = new Float64Array( V2_BPM_COUNT );
        } else {
            v2.blockRe.fill( 0 );
            v2.blockIm.fill( 0 );
        }

        v2.blockW = 0;
    }

    function v2TempoPrior( bpm ) {
        const octaves = Math.log2( bpm / 122 );
        return Math.exp( -( octaves * octaves ) / ( 2 * 0.55 * 0.55 ) );
    }

    function v2EstimateTempo( mediaTime ) {
        const blockDuration = v2.blockStart === null ? 0 : Math.max( 0, mediaTime - v2.blockStart );
        const partialWeight = v2.blockW > 1e-6 && blockDuration >= 6 ? Math.min( 1, blockDuration / V2_TEMPO_BLOCK_SECONDS ) : 0;
        const effective = v2.tempoBlocks + partialWeight;

        if ( effective < 0.6 ) {
            return;
        }

        const score = new Float64Array( V2_BPM_COUNT );
        for ( let k = 0; k < V2_BPM_COUNT; k++ ) {
            let value = v2.tempoTotal[ k ];
            if ( partialWeight > 0 ) {
                value += partialWeight * Math.hypot( v2.blockRe[ k ], v2.blockIm[ k ] ) / v2.blockW;
            }
            score[ k ] = value / effective;
        }

        // A true pulse is usually backed by energy at half its rate
        // (bars, kick patterns). A harmonic of a slower kick train is
        // not, which stops e.g. 132 winning on an 88 BPM half-time beat.
        const halfSupport = k => {
            const target = ( V2_BPM_MIN + k * V2_BPM_STEP ) / 2;
            if ( target < V2_BPM_MIN ) {
                return 0;
            }
            const centre = Math.round( ( target - V2_BPM_MIN ) / V2_BPM_STEP );
            let best = 0;
            for ( let j = Math.max( 0, centre - 4 ); j <= Math.min( V2_BPM_COUNT - 1, centre + 4 ); j++ ) {
                best = Math.max( best, score[ j ] );
            }
            return best;
        };

        const reportFloorK = Math.round( ( V2_BPM_REPORT_MIN - V2_BPM_MIN ) / V2_BPM_STEP );
        const support = new Float64Array( V2_BPM_COUNT );
        let bestK = -1;
        let bestP = -Infinity;
        for ( let k = Math.max( 1, reportFloorK ); k < V2_BPM_COUNT - 1; k++ ) {
            if ( score[ k ] < score[ k - 1 ] || score[ k ] < score[ k + 1 ] ) {
                continue;
            }
            support[ k ] = score[ k ] + 0.5 * halfSupport( k );
            const p = support[ k ] * v2TempoPrior( V2_BPM_MIN + k * V2_BPM_STEP );
            if ( p > bestP ) {
                bestP = p;
                bestK = k;
            }
        }

        if ( bestK < 1 ) {
            return;
        }

        const a = score[ bestK - 1 ];
        const b = score[ bestK ];
        const c = score[ bestK + 1 ];
        const curve = a - 2 * b + c;
        const delta = curve < 0 ? Math.max( -0.5, Math.min( 0.5, 0.5 * ( a - c ) / curve ) ) : 0;
        const raw = V2_BPM_MIN + ( bestK + delta ) * V2_BPM_STEP;

        const sorted = Float64Array.from( score ).sort();
        const floor = sorted[ sorted.length >> 1 ] || 1e-9;
        const peakRatio = b / floor;

        // Strongest competitor that is not this pulse or a simple
        // relative of it (½, ⅔, 1½, 2).
        const relatives = [ 0.5, 2 / 3, 1.5, 2 ];
        let rival = 0;
        for ( let k = Math.max( 1, reportFloorK ); k < V2_BPM_COUNT - 1; k++ ) {
            if ( !support[ k ] ) {
                continue;
            }
            const bpm = V2_BPM_MIN + k * V2_BPM_STEP;
            if ( Math.abs( bpm - raw ) < 4 ) {
                continue;
            }
            if ( relatives.some( ratio => Math.abs( bpm - raw * ratio ) < raw * ratio * 0.025 ) ) {
                continue;
            }
            rival = Math.max( rival, support[ k ] * v2TempoPrior( bpm ) );
        }

        const separation = clamp01( 1 - rival / bestP );
        const strength = clamp01( ( peakRatio - 1.6 ) / 2.4 );
        const maturity = clamp01( effective / 3 );
        const confidence = clamp01( 0.15 + separation * 0.45 + strength * 0.3 + maturity * 0.1 );

        const ratioAt = target => {
            if ( target < V2_BPM_REPORT_MIN || target > V2_BPM_MAX ) {
                return null;
            }
            const k = Math.round( ( target - V2_BPM_MIN ) / V2_BPM_STEP );
            let best = 0;
            for ( let j = Math.max( 0, k - 10 ); j <= Math.min( V2_BPM_COUNT - 1, k + 10 ); j++ ) {
                best = Math.max( best, score[ j ] );
            }
            return Math.round( best / b * 100 ) / 100;
        };

        let bpm = raw;
        if ( confidence >= 0.55 && Math.abs( raw - Math.round( raw ) ) <= 0.25 ) {
            bpm = Math.round( raw );
        }

        v2.bpmRaw = raw;
        v2.bpmHalfRatio = ratioAt( raw / 2 );
        v2.bpmDoubleRatio = ratioAt( raw * 2 );
        v2.bpmPeakRatio = peakRatio;

        // Beat phase for drum-avoiding key snapshots.
        const phaseRe = v2.blockW > 1e-6 && blockDuration >= 6 ? v2.blockRe : v2.prevRe;
        const phaseIm = v2.blockW > 1e-6 && blockDuration >= 6 ? v2.blockIm : v2.prevIm;
        if ( phaseRe && confidence >= 0.5 ) {
            const omega = 2 * Math.PI * raw / 60;
            v2.beatPeriod = 60 / raw;
            v2.beatPhase = Math.atan2( phaseIm[ bestK ], phaseRe[ bestK ] ) / omega;
        } else {
            v2.beatPeriod = null;
            v2.beatPhase = null;
        }

        // A remembered full-track tempo is only replaced by stronger
        // or longer evidence.
        if ( v2.restoredFinal && Number.isFinite( v2.bpm ) && v2.tempoSeconds > v2.seconds ) {
            return;
        }

        if ( confidence < TRACK_ANALYSIS_BPM_MIN_CONFIDENCE ) {
            // Not enough rhythmic evidence (ambient, beatless intro).
            if ( !v2.restored ) {
                v2.bpm = null;
                v2.bpmConfidence = confidence;
            }
            return;
        }

        v2.bpm = bpm;
        v2.bpmConfidence = confidence;
        v2.tempoSeconds = v2.seconds;
    }

    // ---------- key ----------

    function v2SnapshotDue( mediaTime ) {
        const since = mediaTime - v2.lastSnapshotAt;

        if ( since < 0 ) {
            return true; // seek backwards
        }

        if ( since < 0.18 ) {
            return false;
        }

        if ( v2.beatPeriod && Number.isFinite( v2.beatPhase ) ) {
            const centre = mediaTime - v2Nodes.windowCentre;
            let position = ( ( centre - v2.beatPhase ) / v2.beatPeriod ) % 1;
            if ( position < 0 ) {
                position += 1;
            }
            if ( position >= 0.38 && position <= 0.62 ) {
                v2.gatedSnapshots++;
                return true;
            }
            return since > 1.5;
        }

        return since >= 0.25;
    }

    function v2SampleHarmonic( mediaTime ) {
        const nodes = v2Nodes;
        nodes.harmonic.getFloatFrequencyData( nodes.spectrum );

        const size = nodes.bandSize;
        const start = nodes.startBin;
        const amp = nodes.amp;
        let total = 0;

        for ( let i = 0; i < size; i++ ) {
            const db = nodes.spectrum[ start + i ];
            const value = Number.isFinite( db ) ? Math.pow( 10, db / 20 ) : 0;
            amp[ i ] = value;
            total += value;
        }

        v2.lastSnapshotAt = mediaTime;

        if ( total < 1e-7 * size ) {
            return; // silence
        }

        // Harmonic / percussive split.
        if ( !v2.hpssRing || v2.hpssRing.length !== V2_HPSS_FRAMES * size ) {
            v2.hpssRing = new Float64Array( V2_HPSS_FRAMES * size );
            v2.hpssCount = 0;
            v2.hpssIndex = 0;
        }

        v2.hpssRing.set( amp, v2.hpssIndex * size );
        v2.hpssIndex = ( v2.hpssIndex + 1 ) % V2_HPSS_FRAMES;
        v2.hpssCount = Math.min( V2_HPSS_FRAMES, v2.hpssCount + 1 );
        v2.snapshots++;

        const frames = v2.hpssCount;
        const ring = v2.hpssRing;
        const percussive = nodes.percussive;
        const scratch = nodes.scratch;
        const half = V2_FREQ_MEDIAN_HALF;

        for ( let i = 0; i < size; i++ ) {
            const lo = Math.max( 0, i - half );
            const hi = Math.min( size - 1, i + half );
            const count = hi - lo + 1;
            for ( let j = 0; j < count; j++ ) {
                scratch[ j ] = amp[ lo + j ];
            }
            percussive[ i ] = v2Quickselect( scratch, count, count >> 1 );
        }

        const timeValues = new Float64Array( V2_HPSS_FRAMES );
        const binHz = nodes.binHz;
        const frameChroma = new Float64Array( 12 );
        const frameHigh = new Float64Array( 12 );
        const tuning = v2.tuneW > 0 ? Math.atan2( v2.tuneIm, v2.tuneRe ) / ( 2 * Math.PI ) * 100 : 0;
        let peakEnergy = 0;
        let frameTuneRe = 0;
        let frameTuneIm = 0;
        let frameTuneW = 0;
        let previousH = 0;
        let currentH = 0;

        const harmonicAt = i => {
            for ( let f = 0; f < frames; f++ ) {
                timeValues[ f ] = ring[ f * size + i ];
            }
            const timeMedian = v2Quickselect( timeValues, frames, frames >> 1 );
            const p = percussive[ i ];
            const mask = ( timeMedian * timeMedian ) / ( timeMedian * timeMedian + p * p + 1e-20 );
            return amp[ i ] * mask;
        };

        currentH = harmonicAt( 0 );
        let nextH = harmonicAt( 1 );

        for ( let i = 1; i < size - 1; i++ ) {
            previousH = currentH;
            currentH = nextH;
            nextH = harmonicAt( i + 1 );

            if ( currentH <= previousH || currentH < nextH ) {
                continue;
            }

            const salience = currentH / ( percussive[ i ] + 1e-12 );
            if ( salience < 2 ) {
                continue;
            }

            const a = Math.log( amp[ i - 1 ] + 1e-12 );
            const b = Math.log( amp[ i ] + 1e-12 );
            const c = Math.log( amp[ i + 1 ] + 1e-12 );
            const curve = a - 2 * b + c;
            const delta = curve < 0 ? Math.max( -0.5, Math.min( 0.5, 0.5 * ( a - c ) / curve ) ) : 0;
            const hz = ( start + i + delta ) * binHz;

            if ( hz < V2_LOW_HZ || hz > V2_HIGH_HZ ) {
                continue;
            }

            const midiRaw = 69 + 12 * Math.log2( hz / 440 );
            let weight = Math.sqrt( currentH ) * Math.min( 1, ( salience - 2 ) / 4 + 0.25 );
            if ( hz < 100 ) {
                weight *= 0.5;
            }

            peakEnergy += currentH;

            if ( hz >= 100 && hz <= 2000 ) {
                const deviation = midiRaw - Math.round( midiRaw );
                frameTuneRe += weight * Math.cos( 2 * Math.PI * deviation );
                frameTuneIm += weight * Math.sin( 2 * Math.PI * deviation );
                frameTuneW += weight;
            }

            const midi = midiRaw - tuning / 100;
            const nearest = Math.round( midi );
            const distance = Math.abs( midi - nearest );
            const shape = Math.cos( Math.PI * distance );
            const pitchClass = ( ( nearest % 12 ) + 12 ) % 12;
            frameChroma[ pitchClass ] += weight * shape * shape;
            if ( hz >= 100 ) {
                frameHigh[ pitchClass ] += weight * shape * shape;
            }
        }

        v2.tuneRe += frameTuneRe;
        v2.tuneIm += frameTuneIm;
        v2.tuneW += frameTuneW;

        let chromaTotal = 0;
        for ( let i = 0; i < 12; i++ ) {
            chromaTotal += frameChroma[ i ];
        }

        const tonal = clamp01( peakEnergy / total );
        v2.tonalSum += tonal;
        v2.tonalFrames++;

        if ( chromaTotal <= 1e-12 ) {
            return;
        }

        const frameWeight = Math.min( 1, tonal * 4 );
        for ( let i = 0; i < 12; i++ ) {
            v2.chroma[ i ] += frameChroma[ i ] / chromaTotal * frameWeight;
            v2.chromaHigh[ i ] += frameHigh[ i ] / chromaTotal * frameWeight;
        }
        v2.chromaWeight += frameWeight;
    }

    function v2EstimateKey() {
        const seconds = v2.seconds + v2.priorSeconds;

        if ( v2.chromaWeight <= 0 ) {
            if ( seconds >= V2_NO_KEY_SECONDS && v2.tonalFrames > 20 ) {
                v2.noKey = true;
                v2.keyState = 'none';
                v2.keyIndex = null;
                v2.keyScale = null;
            }
            return;
        }

        const chroma = Array.from( v2.chroma, value => value / v2.chromaWeight );

        const candidates = [];
        for ( let tonic = 0; tonic < 12; tonic++ ) {
            candidates.push( { index: tonic, scale: 'major', r: v2Pearson( chroma, V2_EDMA_MAJOR, tonic ) } );
            candidates.push( { index: tonic, scale: 'minor', r: v2Pearson( chroma, V2_EDMA_MINOR, tonic ) + V2_MINOR_BIAS } );
        }
        candidates.sort( ( a, b ) => b.r - a.r );

        const best = candidates[ 0 ];
        const runnerUp = candidates[ 1 ];
        const margin = best.r - runnerUp.r;

        // Chroma flatness: 0 = one pitch class, 1 = perfectly flat.
        let entropy = 0;
        for ( const value of chroma ) {
            if ( value > 0 ) {
                entropy -= value * Math.log( value );
            }
        }
        const flatness = entropy / Math.log( 12 );
        const tonalMean = v2.tonalFrames ? v2.tonalSum / v2.tonalFrames : 0;

        // Is there real harmonic material above the kick/sub range?
        // A tuned kick alone must not produce a key.
        let highTotal = 0;
        for ( const value of v2.chromaHigh ) {
            highTotal += value;
        }
        const highShare = highTotal / v2.chromaWeight;
        let highFlatness = 1;
        let highR = 0;
        if ( highTotal > 0 ) {
            const high = Array.from( v2.chromaHigh, value => value / highTotal );
            let highEntropy = 0;
            for ( const value of high ) {
                if ( value > 0 ) {
                    highEntropy -= value * Math.log( value );
                }
            }
            highFlatness = highEntropy / Math.log( 12 );
            for ( let tonic = 0; tonic < 12; tonic++ ) {
                highR = Math.max( highR, v2Pearson( high, V2_EDMA_MAJOR, tonic ), v2Pearson( high, V2_EDMA_MINOR, tonic ) );
            }
        }
        v2.highShare = highShare;
        v2.highFlatness = highFlatness;
        v2.highR = highR;

        const confidence = clamp01(
            ( best.r - 0.5 ) * 1.2 +
            margin * 5 +
            clamp01( ( 0.97 - flatness ) * 6 ) * 0.15 +
            Math.min( 0.1, seconds / 600 )
        );

        v2.keyR = best.r;
        v2.keyRunnerUp = runnerUp;
        v2.keyRunnerUpR = runnerUp.r;
        v2.keyFlatness = flatness;
        v2.tonalMean = tonalMean;

        const weak =
            best.r < 0.5 ||
            tonalMean < 0.03 ||
            highShare < 0.35 ||
            highFlatness > 0.94 ||
            highR < 0.55;

        if ( seconds >= V2_NO_KEY_SECONDS && weak ) {
            v2.noKey = true;
            v2.keyState = 'none';
            v2.keyIndex = null;
            v2.keyScale = null;
            v2.keyConfidence = confidence;
            return;
        }

        v2.noKey = false;

        // Never show an early guess on material that currently looks
        // atonal: keep LEARNING until real harmonic evidence arrives.
        if ( seconds < V2_KEY_PROVISIONAL_SECONDS || best.r < 0.4 || weak ) {
            if ( weak && !v2.final ) {
                v2.keyIndex = null;
                v2.keyScale = null;
                v2.keyState = 'learning';
            }
            return;
        }

        v2.keyIndex = best.index;
        v2.keyScale = best.scale;
        v2.keyConfidence = confidence;

        if ( v2.final ) {
            v2.keyState = 'final';
        } else if ( seconds >= V2_KEY_FIRM_SECONDS && confidence >= 0.55 ) {
            v2.keyState = 'firm';
        } else {
            v2.keyState = 'provisional';
        }
    }

    function v2TuningCents() {
        if ( v2.tuneW <= 0 ) {
            return null;
        }
        return Math.atan2( v2.tuneIm, v2.tuneRe ) / ( 2 * Math.PI ) * 100;
    }

    // ---------- publish / remember / log ----------

    function v2Publish() {
        // Until v2 has its own answer, keep whatever was restored from
        // memory on screen (including results saved by the classic engine).
        if ( Number.isFinite( v2.bpm ) ) {
            trackAnalysisBpm = v2.bpm;
            trackAnalysisBpmConfidence = v2.bpmConfidence || 0;
        } else if ( !trackAnalysisFromMemory ) {
            trackAnalysisBpm = null;
            trackAnalysisBpmConfidence = v2.bpmConfidence || 0;
        }

        if ( Number.isInteger( v2.keyIndex ) ) {
            trackAnalysisKeyIndex = v2.keyIndex;
            trackAnalysisScale = v2.keyScale;
            trackAnalysisKeyConfidence = v2.keyConfidence || 0;
        } else if ( v2.noKey || !trackAnalysisFromMemory ) {
            trackAnalysisKeyIndex = null;
            trackAnalysisScale = null;
            trackAnalysisKeyConfidence = v2.keyConfidence || 0;
        }
    }

    function v2Coverage() {
        const total = v2.seconds + v2.priorSeconds;
        return v2.duration > 0 ? Math.min( 1, total / v2.duration ) : 0;
    }

    function v2CheckFinal() {
        if ( v2.final ) {
            return;
        }
        const total = v2.seconds + v2.priorSeconds;
        if ( ( v2.duration > 0 && v2Coverage() >= V2_FINAL_COVERAGE ) || total >= V2_FINAL_SECONDS ) {
            v2.final = true;
            if ( Number.isInteger( v2.keyIndex ) ) {
                v2.keyState = 'final';
            }
        }
    }

    function v2Remember() {
        const id = v2?.trackId;
        if ( !id ) {
            return;
        }

        const hasBpm = Number.isFinite( v2.bpm );
        const hasKey = Number.isInteger( v2.keyIndex );
        const total = v2.seconds + v2.priorSeconds;

        if ( !hasBpm && !hasKey && !v2.noKey && v2.chromaWeight <= 0 ) {
            return;
        }

        if ( v2.restoredFinal && v2.seconds < 5 ) {
            return; // nothing new to add
        }

        const entry = { t: Date.now(), e: 2, d: Math.round( total ) };

        if ( hasBpm ) {
            entry.b = Math.round( v2.bpm * 10 ) / 10;
            entry.bc = Math.round( v2.bpmConfidence * 100 ) / 100;
            entry.bd = Math.round( v2.tempoSeconds );
        }

        if ( hasKey ) {
            entry.k = v2.keyIndex;
            entry.kc = Math.round( v2.keyConfidence * 100 ) / 100;
            entry.s = v2.keyScale;
            entry.sc = entry.kc;
        }

        if ( v2.noKey ) {
            entry.nk = 1;
        }

        if ( v2.chromaWeight > 0 ) {
            let max = 0;
            for ( const value of v2.chroma ) {
                max = Math.max( max, value );
            }
            entry.c = Array.from( v2.chroma, value => max > 0 ? Math.round( value / max * 999 ) : 0 );
            entry.ch = Array.from( v2.chromaHigh, value => max > 0 ? Math.round( value / max * 999 ) : 0 );
            entry.cw = Math.round( v2.chromaWeight * 10 ) / 10;
        }

        const tuning = v2TuningCents();
        if ( tuning !== null ) {
            entry.tu = Math.round( tuning * 10 ) / 10;
            entry.tw = Math.round( v2.tuneW * 100 ) / 100;
        }

        if ( v2.tonalFrames ) {
            entry.ts = Math.round( v2.tonalSum * 100 ) / 100;
            entry.tf = v2.tonalFrames;
        }

        if ( v2.final ) {
            entry.f = 1;
        }

        trackAnalysisMemory[ id ] = entry;
        trackAnalysisMemoryDirty = true;

        if ( !trackAnalysisMemoryTimer ) {
            trackAnalysisMemoryTimer = setTimeout( flushTrackAnalysisMemory, 4000 );
        }
    }

    function v2LogEntry() {
        const id = v2.trackId;
        let title = '';
        try {
            title = findVideoById( id )?.title || document.title.replace( /\s*-\s*YouTube\s*$/i, '' );
        } catch {}

        const tuning = v2TuningCents();

        return {
            t: Date.now(),
            id,
            title: String( title || '' ).slice( 0, 90 ),
            eng: 'new',
            sec: Math.round( v2.seconds ),
            prior: Math.round( v2.priorSeconds ),
            dur: Math.round( v2.duration || 0 ),
            bpm: Number.isFinite( v2.bpm ) ? Math.round( v2.bpm * 10 ) / 10 : null,
            raw: Number.isFinite( v2.bpmRaw ) ? Math.round( v2.bpmRaw * 100 ) / 100 : null,
            bc: Math.round( ( v2.bpmConfidence || 0 ) * 100 ),
            half: v2.bpmHalfRatio,
            dbl: v2.bpmDoubleRatio,
            key: v2.noKey ? 'none' : v2KeyLabel( v2.keyIndex, v2.keyScale ),
            kc: Math.round( ( v2.keyConfidence || 0 ) * 100 ),
            r: Math.round( ( v2.keyR || 0 ) * 100 ) / 100,
            alt: v2.keyRunnerUp ? `${v2KeyLabel( v2.keyRunnerUp.index, v2.keyRunnerUp.scale )} ${Math.round( v2.keyRunnerUpR * 100 ) / 100}` : '',
            tune: tuning === null ? null : Math.round( tuning ),
            flat: Number.isFinite( v2.keyFlatness ) ? Math.round( v2.keyFlatness * 100 ) / 100 : null,
            tonal: Number.isFinite( v2.tonalMean ) ? Math.round( v2.tonalMean * 100 ) / 100 : null,
            snaps: v2.snapshots,
            gated: v2.gatedSnapshots,
            state: v2.final ? 'final' : v2.keyState,
            mem: v2.restored ? ( v2.restoredFinal ? 'final' : 'partial' ) : 'no'
        };
    }

    function v2WriteLog() {
        if ( !v2?.trackId || v2.restoredFinal || v2.seconds < 5 ) {
            return;
        }
        try {
            const log = GM_getValue( ANALYSIS_LOG_KEY, [] );
            const list = Array.isArray( log ) ? log.filter( item => item && item.id !== v2.trackId ) : [];
            list.push( v2LogEntry() );
            GM_setValue( ANALYSIS_LOG_KEY, list.slice( -ANALYSIS_LOG_LIMIT ) );
        } catch {}
    }

    function v2FlushOnLeave() {
        if ( !v2 ) {
            return;
        }
        v2CheckFinal();
        if ( v2.seconds > 0 ) {
            v2EstimateKey();
            v2Publish();
        }
        v2Remember();
        v2WriteLog();
    }

    function formatAnalysisLogLine( item ) {
        const when = new Date( item.t || 0 ).toISOString().slice( 5, 16 ).replace( 'T', ' ' );
        const octave = [ item.half !== null && item.half !== undefined ? `½×${item.half}` : '', item.dbl !== null && item.dbl !== undefined ? `2×${item.dbl}` : '' ].filter( Boolean ).join( ' ' );
        return [
            `${when} · ${item.id} · ${item.title || '?'}`,
            `  BPM ${item.bpm ?? '—'} (raw ${item.raw ?? '—'}, ${item.bc}%${octave ? `, ${octave}` : ''})` +
            ` · KEY ${item.key} (${item.kc}%, r ${item.r}, next ${item.alt || '—'})` +
            ` · tune ${item.tune ?? '—'}c · flat ${item.flat ?? '—'} · tonal ${item.tonal ?? '—'}` +
            ` · ${item.sec}s+${item.prior}s/${item.dur}s · snaps ${item.snaps} (${item.gated} between kicks) · ${item.state} · mem ${item.mem}`
        ].join( '\n' );
    }

    function buildAnalysisDiagnosticsLines() {
        const lines = [ 'Analysis engine: v2' ];

        if ( v2?.trackId ) {
            if ( v2.restoredFinal ) {
                lines.push( `Current track: ${v2.trackId} · remembered full-track result · BPM ${Number.isFinite( v2.bpm ) ? v2.bpm : '—'} · KEY ${v2.noKey ? 'none' : v2KeyLabel( v2.keyIndex, v2.keyScale )} (see log below for the original analysis)` );
            } else {
                lines.push( 'Current track (live):', formatAnalysisLogLine( v2LogEntry() ) );
            }
        }

        let log = [];
        try {
            log = GM_getValue( ANALYSIS_LOG_KEY, [] );
        } catch {}

        if ( Array.isArray( log ) && log.length ) {
            lines.push( `Analysis log (last ${log.length} track(s)):` );
            for ( const item of log ) {
                lines.push( formatAnalysisLogLine( item ) );
            }
        } else {
            lines.push( 'Analysis log: empty' );
        }

        return lines;
    }

    // ---------- per-tick driver ----------

    function v2Tick() {
        const id = currentVideoId();

        if ( id !== trackAnalysisTrackId ) {
            resetTrackAnalysis( id );
        }

        if ( !v2 || v2.trackId !== id ) {
            v2Reset( id );
        }

        const video = currentMainVideo();

        if ( !video || video.paused ) {
            v2.lastMediaTime = null;
            return;
        }

        if ( !trackAnalysisTempoAnalyser || !visualizerSource ) {
            attachVisualizerAudio();
            if ( expanded && !utilityPanelOpen ) {
                updateTrackAnalysisUI();
            }
            return;
        }

        if ( v2.restoredFinal ) {
            // Full-track result already saved: show it, no re-analysis.
            if ( !v2.publishedRestored ) {
                v2.publishedRestored = true;
                v2Publish();
            }
            const nowLocked = performance.now();
            if ( expanded && !utilityPanelOpen && nowLocked - v2.lastUiAt >= V2_UI_MS ) {
                v2.lastUiAt = nowLocked;
                updateTrackAnalysisUI();
            }
            return;
        }

        if ( !v2EnsureNodes() ) {
            return;
        }

        const mediaTime = video.currentTime;
        if ( !Number.isFinite( mediaTime ) ) {
            return;
        }

        v2.duration = Number.isFinite( video.duration ) ? video.duration : v2.duration;

        if ( v2.lastMediaTime !== null ) {
            const delta = mediaTime - v2.lastMediaTime;
            if ( delta > 0 && delta < 1 ) {
                v2.seconds += delta;
            }
        }
        v2.lastMediaTime = mediaTime;

        v2SampleKick( mediaTime );

        if ( v2SnapshotDue( mediaTime ) ) {
            v2SampleHarmonic( mediaTime );
        }

        const now = performance.now();
        let changed = false;

        if ( now - v2.lastTempoEstimateAt >= V2_TEMPO_ESTIMATE_MS ) {
            v2.lastTempoEstimateAt = now;
            v2EstimateTempo( mediaTime );
            changed = true;
        }

        if ( now - v2.lastKeyEstimateAt >= V2_KEY_ESTIMATE_MS ) {
            v2.lastKeyEstimateAt = now;
            v2CheckFinal();
            v2EstimateKey();
            changed = true;
        }

        if ( changed ) {
            v2Publish();
        }

        if ( now - v2.lastRememberAt >= V2_REMEMBER_MS && v2.seconds >= 10 ) {
            v2.lastRememberAt = now;
            v2Remember();
            if ( v2.final || v2.seconds >= 30 ) {
                v2WriteLog();
            }
        }

        if ( expanded && !utilityPanelOpen && now - v2.lastUiAt >= V2_UI_MS ) {
            v2.lastUiAt = now;
            updateTrackAnalysisUI();
        }
    }

    function v2RenderAnalysisUI( panel ) {
        const bpmValue = document.getElementById( 'strata-analysis-bpm' );
        const keyValue = document.getElementById( 'strata-analysis-key' );
        const scaleValue = document.getElementById( 'strata-analysis-scale' );
        const camelotValue = document.getElementById( 'strata-analysis-camelot' );
        const tempoConfidence = document.getElementById( 'strata-analysis-tempo-confidence' );
        const keyConfidence = document.getElementById( 'strata-analysis-key-confidence' );
        const state = document.getElementById( 'strata-analysis-state' );
        const hasAudio = Boolean( trackAnalysisTempoAnalyser && visualizerMode === 'AUDIO' );
        const live = v2 || v2NewState( null );
        const total = live.seconds + live.priorSeconds;
        const hasKey = Number.isInteger( trackAnalysisKeyIndex );

        if ( bpmValue ) {
            bpmValue.textContent = formatBpmDisplay( trackAnalysisBpm, trackAnalysisBpmConfidence );
        }

        if ( keyValue ) {
            keyValue.textContent = hasKey ? TRACK_ANALYSIS_NOTE_NAMES[ trackAnalysisKeyIndex ] : '—';
            keyValue.title = live.noKey ? 'No clear key — the track is mostly atonal or percussive' : '';
        }

        if ( scaleValue ) {
            if ( hasKey ) {
                // Older saved results can carry a modal scale (e.g. Dorian).
                const definition = trackAnalysisScaleDefinition( trackAnalysisScale );
                scaleValue.textContent = definition?.short || '—';
                scaleValue.title = definition?.name || '';
            } else {
                scaleValue.textContent = live.noKey ? 'NO KEY' : '—';
                scaleValue.title = live.noKey ? 'No clear key' : '';
            }
        }

        if ( camelotValue ) {
            const camelot = hasKey ? camelotCodeFor( trackAnalysisKeyIndex, trackAnalysisScale ) : null;
            camelotValue.textContent = camelot || '—';
            camelotValue.title = camelot ? 'Camelot code' : '';
        }

        if ( tempoConfidence ) {
            tempoConfidence.textContent = Number.isFinite( trackAnalysisBpm ) ? `TEMPO ${formatTrackAnalysisConfidence( trackAnalysisBpmConfidence )}` : 'TEMPO LEARNING';
        }

        if ( keyConfidence ) {
            if ( live.noKey ) {
                keyConfidence.textContent = 'NO CLEAR KEY';
            } else if ( !hasKey ) {
                keyConfidence.textContent = 'KEY LEARNING';
            } else if ( live.keyState === 'provisional' ) {
                keyConfidence.textContent = `KEY ${formatTrackAnalysisConfidence( trackAnalysisKeyConfidence )} · EARLY`;
            } else if ( live.final ) {
                keyConfidence.textContent = `KEY ${formatTrackAnalysisConfidence( trackAnalysisKeyConfidence )} · FULL TRACK`;
            } else {
                keyConfidence.textContent = `KEY ${formatTrackAnalysisConfidence( trackAnalysisKeyConfidence )}`;
            }
        }

        if ( state ) {
            if ( live.restoredFinal ) {
                state.textContent = 'REMEMBERED';
                state.dataset.state = 'active';
            } else if ( !hasAudio ) {
                state.textContent = 'WAITING FOR AUDIO';
                state.dataset.state = 'waiting';
            } else if ( live.final ) {
                state.textContent = 'FULL TRACK';
                state.dataset.state = 'active';
            } else {
                state.textContent = `ANALYSING ${Math.floor( total )}s`;
                state.dataset.state = 'active';
            }
        }

        panel.dataset.ready = ( Number.isFinite( trackAnalysisBpm ) || hasKey ) ? 'true' : 'false';
    }

    /* STRATA_ANALYSIS_V2_END */


    // ============================================================
    // ABOUT / SUPPORT
    // ============================================================

    /*
        Support link (v8.6.4): PayPal.Me, opened in a new tab.
    */

    const PAYPAL_SUPPORT_URL =
        'https://paypal.me/COLMANBUCKLEY';

    /*
        The expanded panel has its own completely independent home
        position. Once the user drags the large STRATA panel, that
        position is remembered until they move it again.
    */

    const PANEL_ANCHOR_KEY =
        'strata_v859_panel_anchor';


    /*
        EXPANDED PANEL SIZE

        Width and height are completely independent from the panel's
        saved X/Y anchor. Resizing therefore never changes where the
        top-left corner is locked.
    */

    const PANEL_SIZE_KEY =
        'strata_v8518_panel_size';

    /*
        PANEL OPEN/CLOSED STATE

        The user's choice is persistent. If STRATA is expanded, it
        stays expanded across YouTube track changes and full page
        reloads until the user explicitly presses the collapse button.
    */

    const PANEL_EXPANDED_KEY =
        'strata_v8510_panel_expanded';

    /*
        EXPANDED PANEL SECTION STATE

        Release Links, Channels and the footer utility drawer remember
        exactly how the user left them. This state survives STRATA track
        changes and full YouTube page reloads.
    */

    const LINKS_OPEN_KEY =
        'strata_v8511_links_open';

    const CHANNELS_OPEN_KEY =
        'strata_v8511_channels_open';

    const UTILITY_PANEL_KEY =
        'strata_v8511_utility_panel';

    /*
        SINGLE PANEL UI SNAPSHOT

        v8.5.12 keeps one authoritative snapshot of the large player's
        internal open/closed state. This avoids YouTube navigation or a
        full page load rebuilding the panel with default-collapsed sections.

        The older individual keys are still kept for backwards compatibility.
    */

    const PANEL_UI_STATE_KEY =
        'strata_v8512_panel_ui_state';

    /*
        RADIO OWNERSHIP

        These are session-only markers. They let STRATA distinguish a
        track it deliberately selected from a normal YouTube navigation.
        This prevents YouTube's own autoplay/recommendations from being
        mistaken for part of the STRATA radio sequence.
    */

    const SESSION_OWNED_VIDEO_KEY =
        'strata_v858_owned_video';

    const SESSION_EXPECTED_VIDEO_KEY =
        'strata_v858_expected_video';

    /*
        RADIO HANDOFF / MASTER UPDATE STATUS

        The Radio lock prevents a late/duplicate YouTube media-ended event
        from advancing twice during the same track handoff.

        The update check is manual only. It uses the user's own YouTube Data
        API key for that check, never stores the key persistently, and caches
        only the resulting count/timestamp.
    */

    /*
        HOSTED SEED AUTO-UPDATE (GitHub raw)

        STRATA silently checks a hosted master-seed JSON and merges any
        new tracks into the local cache. This is completely separate from
        the bundled seed (which still guarantees a working first run) and
        from the manual import path (which still works as a fallback).

        HOSTED_SEED_URL:
            The raw.githubusercontent.com URL of your master seed JSON.
            Format: https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>.json
            Set this to your own repo. If left as the empty string, the
            hosted check is disabled and STRATA runs purely on the bundled
            seed plus manual imports.

        HOSTED_SEED_CHECK_INTERVAL_MS:
            Minimum time between hosted re-checks. A brand-new install is
            NOT throttled: with no stored last-check time it fetches the
            full hosted catalogue on the first page load, right after the
            bundled starter seed gives instant playback. This interval only
            governs how often existing users re-check GitHub for a NEWER
            commit. It exists because STRATA reloads the page per track,
            so without it init() would fetch on every track change. 1h is
            short enough for prompt updates and far below GitHub's raw
            rate limits even at scale.
    */

    const HOSTED_SEED_URL =
        'https://raw.githubusercontent.com/colman909/strata-seed/refs/heads/main/master.json';

    const HOSTED_SEED_CHECK_INTERVAL_MS =
        60 * 60 * 1000;

    const HOSTED_SEED_LAST_CHECK_KEY =
        'strata_v86_hosted_seed_last_check';

    const HOSTED_SEED_LAST_VERSION_KEY =
        'strata_v86_hosted_seed_last_version';

    /*
        HOSTED_SEED_LAST_CHECK_KEY records the timestamp of the last
        COMPLETED check only (fetch succeeded and parsed). A failed
        fetch/parse never advances it, so a broken hosted file can't buy
        itself a full hour of silence. Failures instead get a short,
        separate backoff so a fixed file recovers quickly without STRATA
        hammering GitHub on every page reload while it's still broken.
    */

    const HOSTED_SEED_LAST_FAILURE_KEY =
        'strata_v86_hosted_seed_last_failure';

    const HOSTED_SEED_FAILURE_BACKOFF_MS =
        10 * 60 * 1000;

    /*
        FAVOURITES PLAYLIST

        Session-only by design. The favourites themselves remain persistent,
        while the active playlist/queue survives YouTube navigation and page
        refreshes in this tab until the user returns to Discovery or closes
        the tab.
    */

    const SESSION_FAVOURITES_PLAYLIST_KEY =
        'strata_v8530_favourites_playlist';

    /*
        Placement migration only.

        This lets v8.5.6 move existing users to the new default
        player-corner position ONCE. After that, any manual drag
        still wins and remains persistent exactly as before.
    */

    const MINI_PLACEMENT_VERSION_KEY =
        'strata_v856_mini_placement_version';

    // v8.5.92: version 2 moves everyone once to the new masthead home
    // (top-left, over YouTube's menu button and logo).
    const MINI_PLACEMENT_VERSION =
        2;

    /*
        v8.5.92 expanded-panel docking.

        By default the big panel is "docked": its left edge sits just to
        the right of the video player and it fills the rest of the window
        top to bottom, covering the recommendations column. It follows
        the player when the window or player size changes. Dragging or
        resizing the panel undocks it (the user's own position then wins,
        as before); double-clicking the resize grip docks it again.
        PANEL_PLACEMENT_VERSION moves existing users to the docked default
        once.
    */

    const PANEL_DOCKED_KEY =
        'strata_v8592_panel_docked';

    const PANEL_PLACEMENT_VERSION_KEY =
        'strata_v8592_panel_placement_version';

    const PANEL_PLACEMENT_VERSION =
        1;

    const PANEL_DOCK_GAP =
        12;

    /*
        v8.5.35 widens the existing mini pill by one 40 px control
        segment so the favourite heart sits INSIDE the same shell.
        Existing users are shifted left once by the same 40 px so the
        pill's right edge stays exactly where they placed it.
    */

    const MINI_FAVOURITE_INTEGRATION_KEY =
        'strata_v8535_integrated_mini_favourite';

    // Safe cache-maintenance coordination. Existing STRATA storage keys above remain untouched.



    // v8.5.26+: one active YouTube tab owns cache maintenance at a time.
    // These keys coordinate ownership and a shared rolling request budget
    // across every STRATA tab using this browser profile.




    // ============================================================
    // UI GEOMETRY
    // ============================================================

    const MINI_WIDTH =
        196;

    const MINI_HEIGHT =
        42;

    const PANEL_WIDTH =
        342;


    const PANEL_MIN_WIDTH =
        300;

    const PANEL_MIN_HEIGHT =
        260;

    // ============================================================
    // PORTABLE SEED LIBRARY
    // ============================================================

    const SEED_FORMAT =
        'strata-seed-v1';


    // ============================================================
    // BUNDLED STARTER LIBRARY
    //
    // v8.5.33 ships the master STRATA catalogue inside the userscript.
    // A fresh installation receives this seed automatically; existing
    // libraries are never replaced and only missing video IDs are merged.
    // ============================================================

    const BUNDLED_SEED_VERSION =
        2;

    const BUNDLED_SEED_VERSION_KEY =
        'strata_v8_bundled_seed_version';

    const BUNDLED_SEED_TRACK_COUNT =
        150;

    const BUNDLED_SEED_CREATED_AT =
        '2026-08-16T14:18:58.821Z';

    const BUNDLED_SEED_DATE_LABEL =
        '16 AUG 2026';

    const BUNDLED_SEED_CHANNELS =
        ["@Acidalia","@AnalogueNetwork","@IndefinitePitch","@MNMT","@subsuelorecs","@PARADIGMAS-jl2so"];

    // Compact groups: "channelIndex,bucketIndex" -> [videoId, title, publishedText?]
    // Bucket indexes follow BUCKETS: recent, 6m_18m, 18m_3y, 3y_5y, 5y_8y, older.
    const BUNDLED_SEED_GROUPS =
        {"0,0":[["bVaJlYAFmbc","Makam - Static Shade [DKMNTL114]","5 months ago"],["tiW00XPRRto","Eric Cloutier - Ligrothism [PALINOIALP01]","4 weeks ago"],["dEQ3ZIZi_84","Steve Rachmad - Wok And Pumpkin [DKMNTL123]","7 days ago"],["H9ZVMkKqY88","Sub Basics - Maneuver 02 B2 [MANEUVER02]","2 months ago"],["89ztKEe8Ptw","Yhii - Eject [B&F05]","2 months ago"],["H7mg2VsE4uU","Feral - Essaouira [DOMUS001]","2 months ago"]],"0,1":[["Tm6e-cnlWu8","Deas - Dissociation [PRRUKBLK124]","15 months ago"],["Uv_OZdhj_y0","Jonas Kopp - Red System #2 [TH13]","17 months ago"],["eTPNaIfs96k","Mode _1 - Zeth [DAYZ018]","13 months ago"],["XosvwZG-cSE","Jonas Kopp - Sideral Tapes 4B [TREMSIX064]","10 months ago"],["-xThfdtbjZ0","G.M. Cole - Omars [SION005]","6 months ago"],["hpn5-WpcbhA","Ribé & Roll Dann - El Nexo [KW40]","12 months ago"]],"0,2":[["sO4i-r9iIjA","Oliver Rosemann & Jonas  Kopp - CO.LAB 006 D [TREMSIX024]","2 years ago"],["a4T0FojiTrw","grad_u - Scrolling Through Lives [GRSCLM100]","2 years ago"],["gGfU7svt8T4","No Spiritual Surrender - Maslac (KTS Remix) [CBR021]","2 years ago"],["a0Dw5XVI3nE","Vardae - Dance With The Spirits [KON021]","2 years ago"],["-WwLe9Q9ook","Convextion - Translucent Blue Display [AW-008]","2 years ago"],["LDKzBrRM4H8","Oliver Rosemann - Mind-Interface [WU97D]","23 months ago"]],"0,3":[["6QkPv7iu3mc","Two Shell - Big Style [LIVITY049]","4 years ago"],["e5Xrm6IZT5w","Decka & Roseen - Drop Out [FW01]","3 years ago"],["KeFO_qy3zt0","Mark Broom - Hypnotic Regression (Edit Select Remix) [EDITSELECT013]","4 years ago"],["4XgR_E7ewZA","Gareth Wild - Night Breed [ETG030]","4 years ago"],["wrgErSfBpTI","Claudio PRC - Nekton [DSR-C18]","3 years ago"],["cS_YpzQniN8","Exium & Dynamic Forces - Subversion [NHEOMA023]","3 years ago"]],"0,4":[["LJtPkcQxnRg","Cosimo Damiano - Pira [DELTAPLANET04]","6 years ago"],["fs_Gu6iSfmY","Vatican Shadow - Hellfire Hidden Tribes [HOS-629]","7 years ago"],["nVLI6plGE9M","Aurora Halal ‎- Liquiddity [MD003]","6 years ago"],["Vj-HCdCOBf0","PRZ - Hotspot [CWCS017]","5 years ago"],["Fly3oTWegSw","Deniro - Heat [TAPE001]","5 years ago"],["w3BFiokKewo","Arcing Seas - Incal [OCS012]","5 years ago"]],"0,5":[["SK7CsNVSbcQ","Ravechild - Refektorium Zzz [SCHLEIFEN001]","8 years ago"],["PxYOsvsZQWo","Size Pier - 237 [CVR003]","8 years ago"],["VPIJ1EbQwEg","DJ Spider & Franklin De Costa - F Planet [BH042]","8 years ago"],["w0_DlRBDXL0","Mari Mattham - Red Light (Evolution Intro Mix) [IAR207]","8 years ago"],["0x8IuXBbccg","Flora - Spira [PI207]","8 years ago"],["x5k066dLGiU","Antonio De Angelis - T-Section [DREF036]","8 years ago"]],"1,0":[["P-g5cHcJ83Q","Viels - PDP [PARTICLE]","2 months ago"],["rQTBZ7gFUJ0","Orbit Shifter - Connection [ALHENA]","5 months ago"],["sg6LvNUG3Ic","Dimi Angelis - NuStar [ANGLS016]","5 months ago"],["uhF3NJR2ThY","Oisel - 533 [HAYES]","4 months ago"],["gy9_a97YiTc","Ricardo Garduno - Night Caller [MDZN044]","7 weeks ago"],["w-FqNus2efw","Yotam Avni - Cycle B [CV08]","5 months ago"]],"1,1":[["lwzlLRk6s2s","Justyn Nell - Obsidian [KI016D]","9 months ago"],["tkOf3pWccFQ","dxrvo - Party Chapter (Feat. hhttpow) [BST028]","6 months ago"],["TtpIQBXvTQ4","Tommaso Arcuri - Veleno Per La Menten II [SYEP039]","9 months ago"],["GsaQY_7YZek","Chaostrail - Summon (Marck D Remix) [RI7MO]","13 months ago"],["NGg8BHBzXaI","Arjun Vagale - Spektron [MINDTRIP]","16 months ago"],["iXVWi90YL9g","Nases Morur - Heavy Punch [RM25]","8 months ago"]],"1,2":[["rLXUZcochB4","AMØK - Time Dilation [NYXII003]","2 years ago"],["QYX52bRUpDU","Stephen Disario - Sixth Sense [CNDRM-003]","2 years ago"],["OLGK7ded0l8","James Harbrecht - Mothership [LQD020]","2 years ago"],["1uhvCcpUGK4","Rybolov - Enemy (Ostap Oleksyn Remix) [PURETOOL]","18 months ago"],["gL9VF35zy6k","Yan Cook - Cipher [DELSIN]","22 months ago"],["14nghAknL6E","Fresko - Screens [TVDGTL001]","2 years ago"]],"1,3":[["DZVDG-zla2E","Vil - Harshell [FRENZYVA001]","4 years ago"],["wUzdUS6qrsM","Pakard - Limpio y Vulgar (JXXXO Remix) [R7M006]","3 years ago"],["sHw6C8B1biI","Jauri - Orion Path [DVTR103]","3 years ago"],["fpDuIeOGz2s","Sam Duties - Bruna [TRUNCATEDGTL09]","4 years ago"],["sN2CQCZuLjI","Holldën - The Technicolor Crow [IAR293]","4 years ago"],["dww9fnt7J5M","Ackermann - I Got My Man [UNCAGEX032]","4 years ago"]],"1,4":[["W34smRmLwCw","The Extraverse - Sudden Change of Habits [NRDR121]","5 years ago"],["IbEnf18UG-U","Skjold - Infinitum [EDITSELECT107D]","5 years ago"],["wl-fCL99UTc","Joline Scheffler - Kalibrerin [SUBTL063]","5 years ago"],["3ZBzwtiCFww","Dustin Zahn - Everything Went Black [NME006]","5 years ago"],["9ZSmrMnfqiA","A Thousand Details - Pfinz Pfinz Puff Puff [ATD011]","5 years ago"]],"1,5":[["on_7a6XWJcU","Amelie Lens - Follow  [SNDST038]","8 years ago"],["d9yPeI7o7cU","Tensal - Luxura [TENSAL008]","8 years ago"],["E8lPJOztdcw","Yan Cook - Makaw [ARTS032]","8 years ago"],["jHs0t_Noi6o","Planetary Assault System - Lazer Organical [MOTE050]","8 years ago"],["2bWQNKTU-WA","Kobosil - Backmask N [OTON105DIGITAL]","9 years ago"]],"2,0":[["D8qvn3q9Aas","Saša Delimar - Phase I","2 weeks ago"],["HqpqQnjB_b8","IP PREMIERE | Orca Silent - They Will Out Live Us VIP [Accents Records (^^^)]","9 days ago"],["kv_qi4kts7s","IMGL - Echo Fern","5 months ago"],["VPBMzj-A7Ts","Overturn - Miralda","5 months ago"],["gGu6N5j8bKU","‘Beyond Us’ taken from the upcoming album ‘Primal Awakening’ by Istvan Roux…","4 months ago"]],"2,1":[["a5uTu0x-eUY","Faddi - Ordinary Wave","16 months ago"],["URM79467MSs","EN.KA - Caelum","11 months ago"],["HXW6lkMPxa8","Mown - Such A Waste","11 months ago"],["6ipU46DMdV0","Martyn Päsch - 090423 (ABSIS Remix)","15 months ago"],["9kP4ztqy6F8","GSSG - Faded Biometrics","15 months ago"]],"2,2":[["q9CFPGLqij0","Dycide - Oscuro","2 years ago"],["bP6L9TPFbag","TVS - 14","2 years ago"],["_pE1kSjhcpE","Qeel - Leptem","2 years ago"],["b92R2VYyNas","Space Drum Meditation - Raijū's Claw","21 months ago"],["deCrf7T-baM","Indefinite Pitch PREMIERES. John Plaza - Plutón [Space Textures]","2 years ago"]],"2,3":[["Erut6__WETk","Vardae - Aphandra","3 years ago"],["0yUqCWUi-vk","Bas Dobbelaer & Vand - Gateway To Gaia","4 years ago"],["EIAUezYyScc","Diffused Signal - Mors","4 years ago"],["eCeYaDBcrF0","Doctrina Natura - Witch Blood (Svarog Remix)","3 years ago"],["3V0V0FoqCSU","Doctrina Natura - Horned God (Ryogo Yamamori Kagerou Remix)","4 years ago"]],"2,4":[["_QR48FlNS4k","Indefinite Pitch premieres. RTNH - Ilatan [Unheard]","5 years ago"],["TBaKhcRNToo","Indefinite Pitch podcast.  Aural Theory 06 by Zemög","5 years ago"],["mumQ7x5Ndxs","Indefinite Pitch premieres. Fütwerk - Bliss In The Abyss [Aythekos]","5 years ago"],["XnLAmxtn-1o","Indefinite Pitch premieres. Hesh & Oliver Si - Plunderer [Initiate Records]","5 years ago"],["XCm4SwV11lc","Indefinite Pitch premieres. AXOON - Funktionswert [Aarden Records]","5 years ago"]],"3,0":[["qoc-ILjec1A","MNMT Recordings : Jin Synth @ La Casita, OHM - Berlin","3 months ago"],["qelGjLdz9tw","MNMT 530 : Salem Unsigned","10 days ago"],["EHMHzIkC9m8","MNMT Recordings : Alexskyspirit @ FLUCC -  Vienna","4 months ago"],["0DXGOOkaBII","MNMT Live : Nils Edte @ Predawn Festival - Stuttgart","2 months ago"],["1BY53FzrZEA","MNMT 521 : Ræza","2 months ago"]],"3,1":[["a23hasz0yk8","MNMT 494 : Loek Frey","9 months ago"],["W6GGXQ4xVdg","Monument Festival 2025 : DOLTZ (live)","9 months ago"],["uBaXAAHS13g","MNMT 462 : Aerae","16 months ago"],["SyRJYLY2NaY","MNMT Live : Pianeti Sintetici","16 months ago"],["gKHkmBmy_Ks","MNMT 473 : Axis Alpha","14 months ago"]],"3,2":[["COZVdw1uVNM","MNMT Live : L-3P @ Enter - Tokyo","20 months ago"],["rGzLTBHttOM","MNMT 438 : Vi","22 months ago"],["YRgyBqa0Zk0","MNMT 404 : Clarence Rise","2 years ago"],["YlZagZy0Z38","MNMT Live : L-3P","2 years ago"],["gfan4LEtUqA","Monument Waves 001 - Chris SSG","2 years ago"]],"3,3":[["RfXOTZ5Rrd0","MNMT 326 : Launaea","4 years ago"],["NhELmmUiBXM","Around The Tree of Peace : Markus Guentner - Tectonic Fields","4 years ago"],["IDLKleKV26c","MNMT Premiere : Joachim Spieth & Cauê - Alpha","4 years ago"],["RvHi51COP1I","MNMT Premiere : Pattrn - Kinetic Pulse","4 years ago"],["8i5X8NSLCSU","MNMT Premiere : Octo Åeterna - Abstra","4 years ago"]],"3,4":[["i9hdBWF47-Q","MNMT 246 Olson","6 years ago"],["QQOpRpRTad0","MNMT Live Stream - Jazz-O-Tech","5 years ago"],["V_mvRvswye8","MNMT Premiere: Blazej Malinowski – Behind","5 years ago"],["MTYHoq-ev-g","MNMT 93: Filip Xavi","7 years ago"],["8Xyg-EmibWc","MNMT Premiere: Viels – Five Feet Under","5 years ago"]],"4,0":[["Eu8USButR8o","Variant – Adrift","2 months ago"],["V7zlPUtCBpQ","Mammo - Tages","4 months ago"],["4xL-hQNrD2U","Picture - Miiiiiii","5 days ago"],["htZKHbunaZA","Jani Ho - Headbanger","5 months ago"],["sERjIYMg-Jk","2501 - Dark Grey (Version)","2 months ago"]],"4,1":[["QGfxDrPsnEQ","Al Wootton - Slow Rock","14 months ago"],["clcGhUHspWw","Mark Ernestus’ Ndagga Rhythm Force - Nimzat","14 months ago"],["ahoAR470sI0","Taction - Caesious","13 months ago"],["cL9sknUXk6I","Rashad Becker - Zero Hour","15 months ago"],["hr9o2InR9qU","Muskila - I Am","7 months ago"]],"4,2":[["72Cs_igEEgs","Didier dlb - Enhancer Dub","18 months ago"],["r42EGUoPjNE","Ghost Dubs - Soul Craft","18 months ago"],["uKbMmDEnhWY",".Vril - Habit Forming","18 months ago"],["jbilGZiZvH0","Fadi Mohem - Redox","18 months ago"],["p3ZO_McBhco","Gosub - Low Volume Lovers","17 months ago"]],"5,0":[["6tdA9o_KChw","Blue Hour - Crimson Delta【Blue Hour Music】","4 months ago"],["9mwqTED6h2M","Temple Rat - Fly! My Paprika 飛吧！我的紅辣椒【Buttheads】","5 months ago"],["VVa5F-8iilg","Aspetuck - REI【A Strangely Isolated Place】","3 months ago"],["kyrygOLdgj8","Almøst Silent - Tough Things【Past Inside the Present】","4 months ago"],["Tn-zFvURUIE","Answer Code Request - Dissolution【Delsin Records】","7 weeks ago"]],"5,1":[["_HRF88m21vg","Sub Accent - Fake Assembly","14 months ago"],["Zpr5bq7wKTo","Adjust (BE) - Wailing Memory","10 months ago"],["EXJspSr1nGA","Plastique01 - Dead Bug 【DE RIO】","7 months ago"],["Iz4M0jkezt4","Tarik Hensen - Lavin","16 months ago"],["r_-kYweGBrU","Darkduction - Buro","16 months ago"]],"5,2":[["LOVTOjjDnuc","Kletis - Deme Deme","2 years ago"],["dLBwIaPrZj0","Infinity aka Saša Delimar - By And By","2 years ago"],["XhdvskkcpIQ","Hakan Cepni - Celestial Pulse","2 years ago"],["a4LL-qnykW0","Michal Wolski - Omen","18 months ago"],["8Xmk7onug7M","Ciel & CCL- Spiral Drive","2 years ago"]]};

    // ============================================================
    // ENGINE SETTINGS
    // ============================================================

    const PREFETCH_SIZE =
        3;

    const RECENT_CHANNEL_WINDOW =
        8;

    // A rare YouTube SPA race can deliver a late/duplicate ended signal
    // while the next STRATA track is already loading. Five seconds is long
    // enough to cover that handoff without affecting normal music tracks.
    const RADIO_END_HANDOFF_LOCK_MS =
        5 * 1000;

    // v8.5.26+: cache maintenance is enabled again, but only for ONE
    // visible + focused YouTube tab at a time. All other STRATA tabs are standby.
    // External release-page lookups (e.g. Bandcamp) are separate from this switch.
    // v8.5.37 master-seed mode:
    // The bundled catalogue is the source of truth. STRATA performs no
    // automatic background YouTube cache requests between seed releases.
    // Release-link lookups and normal browser playback are unaffected.

    // Deliberately very slow because normal listening now relies on the seed/local cache.
    // v8.5.27 uses prime-number minute values as RANDOM ANCHORS rather than
    // a fixed interval. They are not used sequentially and a small random
    // seconds offset is added, so the schedule is staggered rather than exact.

    // Added to the selected prime-minute anchor. This deliberately means the
    // final delay is not restricted to exact prime-number minute boundaries.

    // Even ownership changes cannot cause jobs closer together than this.

    // Counts actual YouTube background requests globally across STRATA tabs.
    // The budget resets automatically after the rolling window below.


    // Active tab ownership heartbeat. A newly-focused tab waits for a stale
    // owner to expire rather than immediately overlapping an in-flight request.



    const SAVE_DEBOUNCE_MS =
        1000;

    // ============================================================
    // STATE
    // ============================================================

    const strataCacheLoadStartedAt =
        performance.now();

    let cache =
        GM_getValue(
            CACHE_KEY,
            {}
        );

    /*
        v8.5.91: the whole catalogue is read from userscript storage on
        every page load (and STRATA loads a page per track). Logged so
        the real cost on each browser is visible before deciding whether
        the catalogue should move to IndexedDB.
    */

    console.log(
        `[STRATA] library read from storage in ${Math.round(performance.now() - strataCacheLoadStartedAt)} ms`
    );

    let channelSettings =
        loadChannelSettings();

    let favourites =
        restoreFavouritesFromBackup(
            GM_getValue(
                FAVOURITES_KEY,
                {}
            )
        );

    let radioEnabled =
        GM_getValue(
            RADIO_KEY,
            true
        );

    let statsOpen =
        GM_getValue(
            STATS_OPEN_KEY,
            false
        );

    /*
        Restore the user's last panel state.

        New installs still begin collapsed. Once the user opens the
        large STRATA panel it remains open through track changes and
        reloads until they deliberately collapse it.
    */

    let expanded =
        Boolean(
            GM_getValue(
                PANEL_EXPANDED_KEY,
                false
            )
        );

    let activeRequests =
        0;

    let initialSweepRunning =
        false;

    let radioEndHandoffLockedUntil =
        0;

    let expectedCorrectionTarget =
        null;

    let expectedCorrectionAt =
        0;

    let saveTimer =
        null;



    let currentLinks =
        [];

    /*
        Release metadata is page data, not audio analysis.

        YouTube exposes the uploader description through several layers:
        the visible/collapsed DOM, the full textContent, Polymer player data
        and the embedded player-response JSON. We merge those sources and
        remember non-empty fields for the current video so a later DOM
        collapse cannot erase a Label we already found.
    */

    let releaseMetadataVideoId =
        null;

    let releaseMetadataSnapshot =
        null;

    let rawDescriptionCacheVideoId =
        null;

    let rawDescriptionCache =
        '';

    const releaseLabelByCatalogue =
        new Map();

    let videosForChannelCache =
        new Map();

    let videoByIdIndex =
        null;

    let uniqueTotalCache =
        new Map();

    let soundCloudArtistProfiles =
        GM_getValue(
            SOUNDCLOUD_ARTIST_CACHE_KEY,
            {}
        );

    if (
        !soundCloudArtistProfiles ||
        typeof soundCloudArtistProfiles !==
            'object' ||
        Array.isArray(
            soundCloudArtistProfiles
        )
    ) {
        soundCloudArtistProfiles =
            {};
    }

    let lastLinkScanVideoId =
        null;

    const savedPanelUiState =
        GM_getValue(
            PANEL_UI_STATE_KEY,
            null
        );

    let linksOpen =
        Boolean(
            savedPanelUiState &&
            typeof savedPanelUiState ===
                'object'
                ? savedPanelUiState.linksOpen
                : GM_getValue(
                    LINKS_OPEN_KEY,
                    false
                )
        );

    let channelsOpen =
        Boolean(
            savedPanelUiState &&
            typeof savedPanelUiState ===
                'object'
                ? savedPanelUiState.channelsOpen
                : GM_getValue(
                    CHANNELS_OPEN_KEY,
                    false
                )
        );

    const savedUtilityPanel =
        savedPanelUiState &&
        typeof savedPanelUiState ===
            'object'
            ? savedPanelUiState.utilityPanelOpen
            : GM_getValue(
                UTILITY_PANEL_KEY,
                null
            );

    let utilityPanelOpen =
        [
            'library',
            'stats',
            'settings',
            'about'
        ].includes(
            savedUtilityPanel
        )
            ? savedUtilityPanel
            : null;

    /*
        Autoplay-on-load state.

        STRATA only attempts this once per YouTube video ID, so a user
        manually pausing a track is never immediately overridden by the
        regular attachPlayer() polling loop. A hard refresh creates a new
        script instance, which intentionally allows the current track to
        start again when RADIO is enabled.
    */

    let autoStartVideoId =
        null;

    let autoStartTimer =
        null;

    /*
        Prevent the synthetic click that can follow a completed drag.
    */

    let suppressMiniClickUntil =
        0;

    const runtimeConfigs =
        new Map();

    // ============================================================
    // MUSIC SERVICES
    // ============================================================

    const MUSIC_SERVICES = [
        {
            name:
                'Bandcamp',

            test:
                host =>
                    host ===
                        'bandcamp.com' ||
                    host.endsWith(
                        '.bandcamp.com'
                    )
        },

        {
            name:
                'Discogs',

            test:
                host =>
                    host ===
                        'discogs.com' ||
                    host.endsWith(
                        '.discogs.com'
                    )
        },

        {
            name:
                'SoundCloud',

            test:
                host =>
                    host ===
                        'soundcloud.com' ||
                    host.endsWith(
                        '.soundcloud.com'
                    )
        },

        {
            name:
                'Beatport',

            test:
                host =>
                    host ===
                        'beatport.com' ||
                    host.endsWith(
                        '.beatport.com'
                    )
        },

        {
            name:
                'Traxsource',

            test:
                host =>
                    host ===
                        'traxsource.com' ||
                    host.endsWith(
                        '.traxsource.com'
                    )
        },

        {
            name:
                'Juno',

            test:
                host =>
                    host.includes(
                        'juno.co.uk'
                    ) ||
                    host ===
                        'junodownload.com' ||
                    host.endsWith(
                        '.junodownload.com'
                    )
        },

        {
            name:
                'Boomkat',

            test:
                host =>
                    host ===
                        'boomkat.com' ||
                    host.endsWith(
                        '.boomkat.com'
                    )
        },

        {
            name:
                'Bleep',

            test:
                host =>
                    host ===
                        'bleep.com' ||
                    host.endsWith(
                        '.bleep.com'
                    )
        },

        {
            name:
                'Clone',

            test:
                host =>
                    host.includes(
                        'clone.nl'
                    )
        },

        {
            name:
                'Hard Wax',

            test:
                host =>
                    host.includes(
                        'hardwax.com'
                    )
        },

        {
            name:
                'Decks',

            test:
                host =>
                    host.includes(
                        'decks.de'
                    )
        },

        {
            name:
                'Resident Advisor',

            test:
                host =>
                    host ===
                        'ra.co' ||
                    host.endsWith(
                        '.ra.co'
                    )
        }
    ];

    const MUSIC_SERVICE_PRIORITY = {
        Bandcamp: 1,
        Discogs: 2,
        SoundCloud: 3,
        Beatport: 4,
        Traxsource: 5,
        Juno: 6,
        Boomkat: 7,
        Bleep: 8,
        Clone: 9,
        'Hard Wax': 10,
        Decks: 11,
        'Resident Advisor': 12
    };

    // ============================================================
    // DATE BUCKETS
    // ============================================================

    function dateMonthsAgo(
        months
    ) {
        const date =
            new Date();

        date.setUTCDate(
            1
        );

        date.setUTCMonth(
            date.getUTCMonth() -
            months
        );

        return date
            .toISOString()
            .slice(
                0,
                10
            );
    }

    const DATES = {
        m6:
            dateMonthsAgo(
                6
            ),

        m18:
            dateMonthsAgo(
                18
            ),

        y3:
            dateMonthsAgo(
                36
            ),

        y5:
            dateMonthsAgo(
                60
            ),

        y8:
            dateMonthsAgo(
                96
            )
    };

    const BUCKETS = [
        {
            id:
                'recent',

            label:
                '0–6 months',

            query:
                `after:${DATES.m6}`
        },

        {
            id:
                '6m_18m',

            label:
                '6–18 months',

            query:
                `after:${DATES.m18} before:${DATES.m6}`
        },

        {
            id:
                '18m_3y',

            label:
                '18 months–3 years',

            query:
                `after:${DATES.y3} before:${DATES.m18}`
        },

        {
            id:
                '3y_5y',

            label:
                '3–5 years',

            query:
                `after:${DATES.y5} before:${DATES.y3}`
        },

        {
            id:
                '5y_8y',

            label:
                '5–8 years',

            query:
                `after:${DATES.y8} before:${DATES.y5}`
        },

        {
            id:
                'older',

            label:
                '8+ years',

            query:
                `before:${DATES.y8}`
        }
    ];

    // ============================================================
    // GENERIC STORAGE
    // ============================================================

    function readSessionArray(
        key
    ) {
        try {
            const raw =
                sessionStorage
                    .getItem(
                        key
                    );

            return raw
                ? JSON.parse(
                    raw
                )
                : [];

        } catch {
            return [];
        }
    }

    function writeSessionArray(
        key,
        value
    ) {
        try {
            sessionStorage
                .setItem(
                    key,
                    JSON.stringify(
                        value
                    )
                );

        } catch {}
    }

    function readSessionObject(
        key
    ) {
        try {
            const raw =
                sessionStorage
                    .getItem(
                        key
                    );

            const parsed =
                raw
                    ? JSON.parse(
                        raw
                    )
                    : {};

            if (
                parsed &&
                typeof parsed ===
                    'object' &&
                !Array.isArray(
                    parsed
                )
            ) {
                return parsed;
            }

        } catch {}

        return {};
    }

    function writeSessionObject(
        key,
        value
    ) {
        try {
            sessionStorage
                .setItem(
                    key,
                    JSON.stringify(
                        value
                    )
                );

        } catch {}
    }

    function getSeen() {
        return new Set(
            readSessionArray(
                SESSION_SEEN_KEY
            )
        );
    }

    function saveSeen(
        seen
    ) {
        writeSessionArray(
            SESSION_SEEN_KEY,
            [...seen]
        );
    }

    function getHistory() {
        return readSessionArray(
            SESSION_HISTORY_KEY
        );
    }

    function saveHistory(
        history
    ) {
        writeSessionArray(
            SESSION_HISTORY_KEY,
            history.slice(
                -500
            )
        );
    }

    function getRecentChannels() {
        return readSessionArray(
            RECENT_CHANNELS_KEY
        );
    }

    function saveRecentChannels(
        channels
    ) {
        writeSessionArray(
            RECENT_CHANNELS_KEY,
            channels.slice(
                -RECENT_CHANNEL_WINDOW
            )
        );
    }

    function getPrefetchQueue() {
        return readSessionArray(
            PREFETCH_KEY
        );
    }

    function savePrefetchQueue(
        queue
    ) {
        writeSessionArray(
            PREFETCH_KEY,
            queue.slice(
                0,
                PREFETCH_SIZE
            )
        );
    }

    function getLastChannel() {
        try {
            return sessionStorage
                .getItem(
                    SESSION_LAST_CHANNEL_KEY
                );

        } catch {
            return null;
        }
    }

    function setLastChannel(
        handle
    ) {
        try {
            sessionStorage
                .setItem(
                    SESSION_LAST_CHANNEL_KEY,
                    handle
                );

        } catch {}
    }

    // ============================================================
    // CHANNEL SETTINGS
    // ============================================================

    function loadChannelSettings() {
        const saved =
            GM_getValue(
                CHANNEL_SETTINGS_KEY,
                null
            );

        if (
            Array.isArray(
                saved
            )
        ) {
            return saved;
        }

        const initial =
            DEFAULT_CHANNELS.map(
                handle => ({
                    handle,
                    enabled:
                        true,

                    builtIn:
                        true
                })
            );

        GM_setValue(
            CHANNEL_SETTINGS_KEY,
            initial
        );

        return initial;
    }

    function saveChannelSettings() {
        GM_setValue(
            CHANNEL_SETTINGS_KEY,
            channelSettings
        );
    }

    function getEnabledChannels() {
        return channelSettings
            .filter(
                channel =>
                    channel.enabled
            )
            .map(
                channel =>
                    channel.handle
            );
    }

    function normalizeChannelInput(
        input
    ) {
        if (!input) {
            return null;
        }

        let value =
            input.trim();

        if (!value) {
            return null;
        }

        try {
            if (
                value.includes(
                    'youtube.com'
                )
            ) {
                if (
                    !/^https?:\/\//i
                        .test(
                            value
                        )
                ) {
                    value =
                        'https://' +
                        value;
                }

                const url =
                    new URL(
                        value
                    );

                const handle =
                    url.pathname
                        .split('/')
                        .filter(
                            Boolean
                        )
                        .find(
                            part =>
                                part.startsWith(
                                    '@'
                                )
                        );

                if (handle) {
                    value =
                        handle;
                }
            }

        } catch {}

        if (
            !value.startsWith(
                '@'
            )
        ) {
            value =
                '@' +
                value;
        }

        return (
            /^@[A-Za-z0-9._-]+$/
                .test(
                    value
                )
                ? value
                : null
        );
    }

    function removeChannel(
        handle
    ) {
        channelSettings =
            channelSettings
                .filter(
                    channel =>
                        channel.handle !==
                        handle
                );

        saveChannelSettings();

        uniqueTotalCache.clear();

        savePrefetchQueue(
            []
        );

        renderChannelManager();

        fillPrefetchQueue();

        updateUI();
    }

    function setChannelEnabled(
        handle,
        enabled
    ) {
        const channel =
            channelSettings
                .find(
                    item =>
                        item.handle ===
                        handle
                );

        if (!channel) {
            return;
        }

        channel.enabled =
            enabled;

        saveChannelSettings();

        uniqueTotalCache.clear();

        savePrefetchQueue(
            []
        );


        fillPrefetchQueue();

        updateUI();
    }

    // ============================================================
    // CACHE
    // ============================================================

    function saveCacheSoon() {
        invalidateCatalogueDerivedCaches();

        if (
            saveTimer
        ) {
            clearTimeout(
                saveTimer
            );
        }

        saveTimer =
            setTimeout(
                flushCache,
                SAVE_DEBOUNCE_MS
            );
    }

    function flushCache() {
        invalidateCatalogueDerivedCaches();

        if (
            saveTimer
        ) {
            clearTimeout(
                saveTimer
            );

            saveTimer =
                null;
        }

        cancelIdleCacheFlush();

        const startedAt =
            performance.now();

        GM_setValue(
            CACHE_KEY,
            cache
        );

        const elapsed =
            Math.round(
                performance.now() -
                startedAt
            );

        if (
            elapsed >
            50
        ) {
            console.log(
                `[STRATA] library write took ${elapsed} ms`
            );
        }
    }

    /*
        v8.5.91: catalogue writes are only needed when a seed merge adds
        tracks, but that merge runs during page start-up, exactly while
        YouTube is starting playback. The in-memory cache is already
        updated, so the (large, synchronous) storage write is deferred to
        an idle moment. pagehide flushes it if the page leaves first.
    */

    let idleCacheFlushHandle =
        0;

    let idleCacheFlushUsesIdleCallback =
        false;

    function cancelIdleCacheFlush() {
        if (
            !idleCacheFlushHandle
        ) {
            return;
        }

        try {
            if (
                idleCacheFlushUsesIdleCallback
            ) {
                cancelIdleCallback(
                    idleCacheFlushHandle
                );
            } else {
                clearTimeout(
                    idleCacheFlushHandle
                );
            }
        } catch {}

        idleCacheFlushHandle =
            0;
    }

    function scheduleIdleCacheFlush() {
        invalidateCatalogueDerivedCaches();

        if (
            idleCacheFlushHandle
        ) {
            return;
        }

        if (
            typeof requestIdleCallback ===
                'function'
        ) {
            idleCacheFlushUsesIdleCallback =
                true;

            idleCacheFlushHandle =
                requestIdleCallback(
                    () => {
                        idleCacheFlushHandle =
                            0;

                        flushCache();
                    },
                    {
                        timeout:
                            6000
                    }
                );

            return;
        }

        idleCacheFlushUsesIdleCallback =
            false;

        idleCacheFlushHandle =
            setTimeout(
                () => {
                    idleCacheFlushHandle =
                        0;

                    flushCache();
                },
                2500
            );
    }

    function flushPendingCacheWrite() {
        if (
            idleCacheFlushHandle
        ) {
            flushCache();
        }
    }

    function ensureChannel(
        handle
    ) {
        if (
            !cache[
                handle
            ]
        ) {
            cache[
                handle
            ] = {
                buckets:
                    {}
            };
        }

        if (
            !cache[
                handle
            ].buckets
        ) {
            cache[
                handle
            ].buckets =
                {};
        }

        return cache[
            handle
        ];
    }

    function ensureBucket(
        handle,
        bucket
    ) {
        const channel =
            ensureChannel(
                handle
            );

        if (
            !channel.buckets[
                bucket.id
            ]
        ) {
            channel.buckets[
                bucket.id
            ] = {
                videos:
                    [],

                continuation:
                    null,

                initialized:
                    false,

                exhausted:
                    false,

                pages:
                    0,

                failureCount:
                    0,

                nextRetryAt:
                    0,

                lastUpdated:
                    0
            };
        }

        const state =
            channel.buckets[
                bucket.id
            ];

        if (
            !Array.isArray(
                state.videos
            )
        ) {
            state.videos =
                [];
        }

        return state;
    }

    // ============================================================
    // LIBRARY
    // ============================================================

    function invalidateCatalogueDerivedCaches() {
        videosForChannelCache.clear();

        videoByIdIndex =
            null;

        uniqueTotalCache.clear();
    }


    function dedupeVideos(
        videos
    ) {
        return [
            ...new Map(
                videos
                    .filter(
                        video =>
                            video &&
                            video.videoId
                    )
                    .map(
                        video => [
                            video.videoId,
                            video
                        ]
                    )
            ).values()
        ];
    }

    function videosForChannel(
        handle
    ) {
        if (
            videosForChannelCache.has(
                handle
            )
        ) {
            return videosForChannelCache.get(
                handle
            );
        }

        const combined =
            [];

        for (
            const bucket
            of BUCKETS
        ) {
            combined.push(
                ...ensureBucket(
                    handle,
                    bucket
                ).videos
            );
        }

        const videos =
            dedupeVideos(
                combined
            );

        videosForChannelCache.set(
            handle,
            videos
        );

        return videos;
    }

    function getUniqueTotal() {
        const handles =
            getEnabledChannels();

        const cacheKey =
            handles.join(
                '\u0001'
            );

        if (
            uniqueTotalCache.has(
                cacheKey
            )
        ) {
            return uniqueTotalCache.get(
                cacheKey
            );
        }

        const ids =
            new Set();

        for (
            const handle
            of handles
        ) {
            for (
                const video
                of videosForChannel(
                    handle
                )
            ) {
                ids.add(
                    video.videoId
                );
            }
        }

        const total =
            ids.size;

        uniqueTotalCache.set(
            cacheKey,
            total
        );

        return total;
    }

    function getLocalLibraryTotal() {
        const ids =
            new Set();

        for (
            const handle
            of Object.keys(
                cache
            )
        ) {
            for (
                const video
                of videosForChannel(
                    handle
                )
            ) {
                if (
                    video &&
                    video.videoId
                ) {
                    ids.add(
                        video.videoId
                    );
                }
            }
        }

        return ids.size;
    }

    /*
        The catalogue version is the hosted seed's createdAt once a hosted
        merge has happened, otherwise the bundled starter's timestamp.
    */

    function currentCatalogueVersion() {
        return String(
            GM_getValue(
                HOSTED_SEED_LAST_VERSION_KEY,
                ''
            ) ||
            BUNDLED_SEED_CREATED_AT
        );
    }

    function formatCompactAge(
        timestamp
    ) {
        const time =
            Number(
                timestamp
            );

        if (
            !Number.isFinite(
                time
            )
        ) {
            return '';
        }

        const elapsed =
            Math.max(
                0,
                Date.now() -
                    time
            );

        const minute =
            60 * 1000;

        const hour =
            60 * minute;

        const day =
            24 * hour;

        if (
            elapsed <
            minute
        ) {
            return 'just now';
        }

        if (
            elapsed <
            hour
        ) {
            const value =
                Math.floor(
                    elapsed /
                    minute
                );

            return `${value}m ago`;
        }

        if (
            elapsed <
            day
        ) {
            const value =
                Math.floor(
                    elapsed /
                    hour
                );

            return `${value}h ago`;
        }

        const days =
            Math.floor(
                elapsed /
                day
            );

        if (
            days <
            60
        ) {
            return `${days}d ago`;
        }

        const months =
            Math.floor(
                days /
                30.4375
            );

        if (
            months <
            24
        ) {
            return `${months}mo ago`;
        }

        const years =
            Math.floor(
                days /
                365.25
            );

        return `${years}y ago`;
    }

    function masterSnapshotDisplay() {
        const created =
            Date.parse(
                currentCatalogueVersion()
            );

        if (
            !Number.isFinite(
                created
            )
        ) {
            return BUNDLED_SEED_DATE_LABEL;
        }

        let label =
            BUNDLED_SEED_DATE_LABEL;

        try {
            label =
                new Intl.DateTimeFormat(
                    'en-GB',
                    {
                        day:
                            '2-digit',
                        month:
                            'short',
                        year:
                            'numeric',
                        timeZone:
                            'UTC'
                    }
                )
                    .format(
                        new Date(
                            created
                        )
                    )
                    .toUpperCase();

        } catch {}

        const age =
            formatCompactAge(
                created
            );

        return age
            ? `${label} · ${age.toUpperCase()}`
            : label;
    }

    function findVideoById(
        id
    ) {
        if (!id) {
            return null;
        }

        if (
            !videoByIdIndex
        ) {
            videoByIdIndex =
                new Map();

            for (
                const handle
                of Object.keys(
                    cache
                )
            ) {
                for (
                    const video
                    of videosForChannel(
                        handle
                    )
                ) {
                    if (
                        video?.videoId &&
                        !videoByIdIndex.has(
                            video.videoId
                        )
                    ) {
                        videoByIdIndex.set(
                            video.videoId,
                            video
                        );
                    }
                }
            }
        }

        return (
            videoByIdIndex.get(
                id
            ) ||
            null
        );
    }

    // ============================================================
    // SEED LIBRARY — EXPORT / IMPORT
    //
    // These tools do not alter STRATA's playback engine. They provide a
    // compact, portable representation of the existing cached catalogue.
    // ============================================================

    function collectSeedTracksFromCache(
        sourceCache = cache
    ) {
        const tracks = [];
        const seen = new Set();

        for (
            const [
                fallbackHandle,
                channelState
            ]
            of Object.entries(
                sourceCache || {}
            )
        ) {
            const buckets =
                channelState &&
                typeof channelState ===
                    'object'
                    ? channelState.buckets
                    : null;

            if (
                !buckets ||
                typeof buckets !==
                    'object'
            ) {
                continue;
            }

            for (
                const [
                    fallbackBucketId,
                    bucketState
                ]
                of Object.entries(
                    buckets
                )
            ) {
                if (
                    !bucketState ||
                    !Array.isArray(
                        bucketState.videos
                    )
                ) {
                    continue;
                }

                for (
                    const video
                    of bucketState.videos
                ) {
                    const videoId =
                        video?.videoId;

                    if (
                        !videoId ||
                        seen.has(
                            videoId
                        )
                    ) {
                        continue;
                    }

                    seen.add(
                        videoId
                    );

                    const bucketId =
                        video.bucketId ||
                        fallbackBucketId ||
                        'recent';

                    const bucketDef =
                        BUCKETS.find(
                            item =>
                                item.id ===
                                    bucketId
                        );

                    const track = {
                        videoId,
                        title:
                            video.title ||
                            'Untitled',
                        channelHandle:
                            video.channelHandle ||
                            fallbackHandle,
                        bucketId,
                        bucketLabel:
                            video.bucketLabel ||
                            bucketDef?.label ||
                            ''
                    };

                    if (
                        video.publishedText
                    ) {
                        track.publishedText =
                            video.publishedText;
                    }

                    tracks.push(
                        track
                    );
                }
            }
        }

        return tracks;
    }

    function normalizeImportedSeed(
        parsed
    ) {
        if (
            parsed &&
            parsed.format ===
                SEED_FORMAT &&
            Array.isArray(
                parsed.tracks
            )
        ) {
            return parsed.tracks;
        }

        if (
            Array.isArray(
                parsed
            )
        ) {
            return parsed;
        }

        if (
            parsed &&
            typeof parsed ===
                'object'
        ) {
            const fromCache =
                collectSeedTracksFromCache(
                    parsed
                );

            if (
                fromCache.length
            ) {
                return fromCache;
            }
        }

        throw new Error(
            'This is not a recognised STRATA library file.'
        );
    }

    function mergeSeedTracks(
        tracks
    ) {
        const knownIds =
            new Set();

        for (
            const handle
            of Object.keys(
                cache
            )
        ) {
            for (
                const video
                of videosForChannel(
                    handle
                )
            ) {
                if (
                    video?.videoId
                ) {
                    knownIds.add(
                        video.videoId
                    );
                }
            }
        }

        let added = 0;
        const touchedBuckets =
            new Set();

        for (
            const track
            of tracks
        ) {
            if (
                !track ||
                typeof track.videoId !==
                    'string' ||
                !/^[A-Za-z0-9_-]{11}$/
                    .test(
                        track.videoId
                    ) ||
                knownIds.has(
                    track.videoId
                )
            ) {
                continue;
            }

            const handle =
                normalizeChannelInput(
                    track.channelHandle ||
                    ''
                );

            if (!handle) {
                continue;
            }

            const bucket =
                BUCKETS.find(
                    item =>
                        item.id ===
                            track.bucketId
                ) ||
                BUCKETS[0];

            const state =
                ensureBucket(
                    handle,
                    bucket
                );

            state.videos.push({
                videoId:
                    track.videoId,
                title:
                    track.title ||
                    'Untitled',
                publishedText:
                    track.publishedText ||
                    '',
                channelHandle:
                    handle,
                bucketId:
                    bucket.id,
                bucketLabel:
                    bucket.label
            });

            state.initialized =
                true;
            state.lastUpdated =
                Math.max(
                    state.lastUpdated ||
                        0,
                    Date.now()
                );

            touchedBuckets.add(
                `${handle}::${bucket.id}`
            );
            knownIds.add(
                track.videoId
            );
            added++;
        }

        for (
            const key
            of touchedBuckets
        ) {
            const [
                handle,
                bucketId
            ] =
                key.split(
                    '::'
                );

            const bucket =
                BUCKETS.find(
                    item =>
                        item.id ===
                            bucketId
                );

            if (!bucket) {
                continue;
            }

            const state =
                ensureBucket(
                    handle,
                    bucket
                );

            state.videos =
                dedupeVideos(
                    state.videos
                );
        }

        if (
            added >
            0
        ) {
            scheduleIdleCacheFlush();
            savePrefetchQueue(
                []
            );
            fillPrefetchQueue();
            updateUI();
        }

        return added;
    }


    function decodeBundledSeedTracks() {
        const tracks =
            [];

        for (
            const [
                key,
                rows
            ]
            of Object.entries(
                BUNDLED_SEED_GROUPS
            )
        ) {
            const [
                channelIndex,
                bucketIndex
            ] =
                key
                    .split(',')
                    .map(
                        Number
                    );

            const channelHandle =
                BUNDLED_SEED_CHANNELS[
                    channelIndex
                ];

            const bucket =
                BUCKETS[
                    bucketIndex
                ];

            if (
                !channelHandle ||
                !bucket ||
                !Array.isArray(
                    rows
                )
            ) {
                continue;
            }

            for (
                const row
                of rows
            ) {
                if (
                    !Array.isArray(
                        row
                    ) ||
                    !row[0]
                ) {
                    continue;
                }

                tracks.push({
                    videoId:
                        row[0],
                    title:
                        row[1] ||
                        'Untitled',
                    channelHandle,
                    bucketId:
                        bucket.id,
                    bucketLabel:
                        bucket.label,
                    publishedText:
                        row[2] ||
                        ''
                });
            }
        }

        return tracks;
    }

    function installBundledSeedIfNeeded() {
        const appliedVersion =
            Number(
                GM_getValue(
                    BUNDLED_SEED_VERSION_KEY,
                    0
                )
            ) ||
            0;

        const currentTotal =
            getLocalLibraryTotal();

        // Normal runs do no seed work once this version is installed.
        // If the local catalogue is unexpectedly empty, restore the bundled
        // starter even when the version marker survived a storage change.
        if (
            appliedVersion >=
                BUNDLED_SEED_VERSION &&
            currentTotal >
                0
        ) {
            return {
                added:
                    0,
                supplied:
                    BUNDLED_SEED_TRACK_COUNT,
                skipped:
                    true
            };
        }

        const tracks =
            decodeBundledSeedTracks();

        const added =
            mergeSeedTracks(
                tracks
            );

        GM_setValue(
            BUNDLED_SEED_VERSION_KEY,
            BUNDLED_SEED_VERSION
        );

        console.log(
            `[STRATA] bundled seed v${BUNDLED_SEED_VERSION}: ${added.toLocaleString()} added / ${tracks.length.toLocaleString()} supplied`
        );

        return {
            added,
            supplied:
                tracks.length,
            skipped:
                false
        };
    }

    // ============================================================
    // RANDOM PICKER
    // ============================================================

    function randomItem(
        array
    ) {
        if (
            !array.length
        ) {
            return null;
        }

        return array[
            Math.floor(
                Math.random() *
                array.length
            )
        ];
    }

    function weightedRandom(
        items,
        weightFn
    ) {
        if (
            !items.length
        ) {
            return null;
        }

        const weighted =
            items.map(
                item => ({
                    item,

                    weight:
                        Math.max(
                            0.0001,
                            Number(
                                weightFn(
                                    item
                                )
                            ) ||
                            0.0001
                        )
                })
            );

        const total =
            weighted.reduce(
                (
                    sum,
                    entry
                ) =>
                    sum +
                    entry.weight,
                0
            );

        let roll =
            Math.random() *
            total;

        for (
            const entry
            of weighted
        ) {
            roll -=
                entry.weight;

            if (
                roll <=
                0
            ) {
                return entry.item;
            }
        }

        return weighted[
            weighted.length -
            1
        ].item;
    }

    function cleanPrefetchQueue() {
        const seen =
            getSeen();

        const enabled =
            new Set(
                getEnabledChannels()
            );

        const queue =
            getPrefetchQueue()
                .filter(
                    item =>
                        item &&
                        item.videoId &&
                        item.channelHandle &&
                        !seen.has(
                            item.videoId
                        ) &&
                        enabled.has(
                            item.channelHandle
                        ) &&
                        videosForChannel(
                            item.channelHandle
                        ).some(
                            video =>
                                video.videoId ===
                                item.videoId
                        )
                );

        const deduped =
            dedupeVideos(
                queue
            );

        savePrefetchQueue(
            deduped
        );

        return deduped;
    }

    function selectCandidate(
        excludeIds =
            new Set(),

        simulatedRecent =
            []
    ) {
        const seen =
            getSeen();

        const recent =
            [
                ...getRecentChannels(),
                ...simulatedRecent
            ].slice(
                -RECENT_CHANNEL_WINDOW
            );

        const eligible =
            getEnabledChannels()
                .filter(
                    handle =>
                        videosForChannel(
                            handle
                        ).some(
                            video =>
                                !seen.has(
                                    video.videoId
                                ) &&
                                !excludeIds.has(
                                    video.videoId
                                ) &&
                                videoMatchesEra(
                                    video
                                )
                        )
                );

        if (
            !eligible.length
        ) {
            return null;
        }

        const lastChannel =
            recent.length
                ? recent[
                    recent.length -
                    1
                ]
                : getLastChannel();

        const chosenChannel =
            weightedRandom(
                eligible,

                handle => {
                    const recentCount =
                        recent.filter(
                            value =>
                                value ===
                                handle
                        ).length;

                    let weight =
                        1 /
                        (
                            1 +
                            recentCount *
                            1.6
                        );

                    if (
                        eligible.length >
                            1 &&
                        handle ===
                            lastChannel
                    ) {
                        weight *=
                            0.18;
                    }

                    return weight;
                }
            );

        const candidates =
            videosForChannel(
                chosenChannel
            ).filter(
                video =>
                    !seen.has(
                        video.videoId
                    ) &&
                    !excludeIds.has(
                        video.videoId
                    ) &&
                    videoMatchesEra(
                        video
                    )
            );

        return randomItem(
            candidates
        );
    }

    function fillPrefetchQueue() {
        let queue =
            cleanPrefetchQueue();

        const excludeIds =
            new Set(
                queue.map(
                    item =>
                        item.videoId
                )
            );

        const simulatedRecent =
            queue.map(
                item =>
                    item.channelHandle
            );

        let safety =
            0;

        while (
            queue.length <
                PREFETCH_SIZE &&
            safety <
                20
        ) {
            safety++;

            const candidate =
                selectCandidate(
                    excludeIds,
                    simulatedRecent
                );

            if (!candidate) {
                break;
            }

            queue.push(
                candidate
            );

            excludeIds.add(
                candidate.videoId
            );

            simulatedRecent.push(
                candidate.channelHandle
            );
        }

        savePrefetchQueue(
            queue
        );

        updateUI();

        return queue;
    }

    function pickRandomVideo() {
        let chosen =
            null;

        const focusMode =
            isFocusActive();

        if (focusMode) {
            chosen =
                selectFocusCandidate();

        } else {
            chosen =
                selectHarmonicCandidate();

            if (!chosen) {
                const queue =
                    cleanPrefetchQueue();

                chosen =
                    queue.shift() ||
                    null;

                savePrefetchQueue(
                    queue
                );
            }

            if (!chosen) {
                chosen =
                    selectCandidate();
            }
        }

        if (!chosen) {
            return null;
        }

        const seen =
            getSeen();

        if (
            !focusMode &&
            seen.has(
                chosen.videoId
            )
        ) {
            fillPrefetchQueue();

            return null;
        }

        seen.add(
            chosen.videoId
        );

        saveSeen(
            seen
        );

        const recent =
            getRecentChannels();

        recent.push(
            chosen.channelHandle
        );

        saveRecentChannels(
            recent
        );

        setLastChannel(
            chosen.channelHandle
        );

        fillPrefetchQueue();

        return chosen;
    }

    // ============================================================
    // v8.5.81 — RADIO MODES
    //
    // ERA FILTER      Fresh / Everything / Deep cuts, from each track's
    //                 age bucket. Applies to normal discovery picks.
    // LABEL / ARTIST  Click the label or artist in the hero line to play
    // RADIO           only matching tracks across the whole catalogue.
    // TRACK MEMORY    BPM / key / scale estimates are remembered per video
    //                 so a returning track shows its analysis instantly.
    // HARMONIC MIX    When on, discovery prefers remembered tracks whose
    //                 Camelot key and/or tempo suit the current track.
    // ============================================================

    const RADIO_ERA_KEY =
        'strata_v881_radio_era';

    const HARMONIC_MIX_KEY =
        'strata_v881_harmonic_mix';

    const TRACK_ANALYSIS_MEMORY_KEY =
        'strata_v881_track_analysis';

    const SESSION_FOCUS_KEY =
        'strata_v881_focus_radio';

    const RADIO_ERA_OPTIONS = [
        {
            id: 'fresh',
            label: 'FRESH',
            title: 'Last 18 months only',
            buckets: new Set(['recent', '6m_18m'])
        },
        {
            id: 'all',
            label: 'EVERYTHING',
            title: 'Whole catalogue',
            buckets: null
        },
        {
            id: 'deep',
            label: 'DEEP CUTS',
            title: 'Three years and older',
            buckets: new Set(['3y_5y', '5y_8y', 'older'])
        }
    ];

    // Chance that a pick uses a harmonic match when one exists, so the
    // radio still wanders instead of locking into one key.
    const HARMONIC_PICK_CHANCE =
        0.8;

    const HARMONIC_BPM_TOLERANCE =
        0.06;

    const TRACK_ANALYSIS_MEMORY_LIMIT =
        25000;

    let radioEra =
        normalizeRadioEra(
            GM_getValue(
                RADIO_ERA_KEY,
                'all'
            )
        );

    let harmonicMixEnabled =
        Boolean(
            GM_getValue(
                HARMONIC_MIX_KEY,
                false
            )
        );

    let trackAnalysisMemory =
        loadTrackAnalysisMemory();

    let trackAnalysisMemoryDirty =
        false;

    let trackAnalysisMemoryTimer =
        null;

    let trackAnalysisFromMemory =
        false;

    // ---------------- ERA ----------------

    function normalizeRadioEra(
        value
    ) {
        return RADIO_ERA_OPTIONS.some(
            option =>
                option.id ===
                    value
        )
            ? value
            : 'all';
    }

    function videoMatchesEra(
        video
    ) {
        const option =
            RADIO_ERA_OPTIONS.find(
                item =>
                    item.id ===
                        radioEra
            );

        if (
            !option ||
            !option.buckets
        ) {
            return true;
        }

        return option.buckets.has(
            video?.bucketId
        );
    }

    function setRadioEra(
        value
    ) {
        radioEra =
            normalizeRadioEra(
                value
            );

        GM_setValue(
            RADIO_ERA_KEY,
            radioEra
        );

        // The prefetched picks were chosen under the old era.
        savePrefetchQueue(
            []
        );

        fillPrefetchQueue();

        const option =
            RADIO_ERA_OPTIONS.find(
                item =>
                    item.id ===
                        radioEra
            );

        setStatus(
            `Radio era · ${option?.label || 'EVERYTHING'}`
        );

        updateUI();
    }

    function setHarmonicMixEnabled(
        enabled
    ) {
        harmonicMixEnabled =
            Boolean(
                enabled
            );

        GM_setValue(
            HARMONIC_MIX_KEY,
            harmonicMixEnabled
        );

        setStatus(
            harmonicMixEnabled
                ? 'Harmonic mix on'
                : 'Harmonic mix off'
        );

        updateUI();
    }

    // ---------------- TRACK MEMORY ----------------

    function loadTrackAnalysisMemory() {
        const stored =
            GM_getValue(
                TRACK_ANALYSIS_MEMORY_KEY,
                {}
            );

        return stored &&
            typeof stored ===
                'object' &&
            !Array.isArray(
                stored
            )
            ? stored
            : {};
    }

    function flushTrackAnalysisMemory() {
        if (
            trackAnalysisMemoryTimer
        ) {
            clearTimeout(
                trackAnalysisMemoryTimer
            );

            trackAnalysisMemoryTimer =
                null;
        }

        if (
            !trackAnalysisMemoryDirty
        ) {
            return;
        }

        trackAnalysisMemoryDirty =
            false;

        const ids =
            Object.keys(
                trackAnalysisMemory
            );

        if (
            ids.length >
                TRACK_ANALYSIS_MEMORY_LIMIT
        ) {
            ids
                .sort(
                    (
                        a,
                        b
                    ) =>
                        (
                            trackAnalysisMemory[a]?.t ||
                            0
                        ) -
                        (
                            trackAnalysisMemory[b]?.t ||
                            0
                        )
                )
                .slice(
                    0,
                    ids.length -
                        TRACK_ANALYSIS_MEMORY_LIMIT
                )
                .forEach(
                    id => {
                        delete trackAnalysisMemory[
                            id
                        ];
                    }
                );
        }

        GM_setValue(
            TRACK_ANALYSIS_MEMORY_KEY,
            trackAnalysisMemory
        );
    }


    function restoreTrackAnalysisFromMemory(
        id
    ) {
        trackAnalysisFromMemory =
            false;

        const entry =
            id
                ? trackAnalysisMemory[
                    id
                ]
                : null;

        if (!entry) {
            return;
        }

        if (
            Number.isFinite(
                entry.b
            )
        ) {
            trackAnalysisBpm =
                entry.b;

            trackAnalysisBpmConfidence =
                Number(
                    entry.bc
                ) ||
                TRACK_ANALYSIS_BPM_MIN_CONFIDENCE;
        }

        if (
            Number.isInteger(
                entry.k
            )
        ) {
            trackAnalysisKeyIndex =
                entry.k;

            trackAnalysisKeyConfidence =
                Number(
                    entry.kc
                ) ||
                TRACK_ANALYSIS_KEY_MIN_CONFIDENCE;
        }

        if (
            entry.s &&
            trackAnalysisScaleDefinition(
                entry.s
            )
        ) {
            trackAnalysisScale =
                entry.s;

        }

        trackAnalysisFromMemory =
            Number.isFinite(
                trackAnalysisBpm
            ) ||
            Number.isInteger(
                trackAnalysisKeyIndex
            );
    }

    // ---------------- HARMONIC MIX ----------------

    function camelotCodeFor(
        keyIndex,
        scale
    ) {
        if (
            !Number.isInteger(
                keyIndex
            )
        ) {
            return null;
        }

        if (
            scale ===
                'minor'
        ) {
            return TRACK_ANALYSIS_CAMELOT_MINOR[
                keyIndex
            ];
        }

        if (
            scale ===
                'major'
        ) {
            return TRACK_ANALYSIS_CAMELOT_MAJOR[
                keyIndex
            ];
        }

        return null;
    }

    function parseCamelotCode(
        code
    ) {
        const match =
            /^(\d+)([AB])$/.exec(
                String(
                    code ||
                    ''
                )
            );

        return match
            ? {
                n:
                    Number(
                        match[1]
                    ),
                l:
                    match[2]
            }
            : null;
    }

    function camelotCompatible(
        a,
        b
    ) {
        if (
            !a ||
            !b
        ) {
            return false;
        }

        if (
            a.n ===
                b.n
        ) {
            return true;
        }

        if (
            a.l !==
                b.l
        ) {
            return false;
        }

        const distance =
            Math.abs(
                a.n -
                    b.n
            );

        return (
            distance ===
                1 ||
            distance ===
                11
        );
    }

    function bpmCompatible(
        a,
        b
    ) {
        if (
            !Number.isFinite(
                a
            ) ||
            !Number.isFinite(
                b
            ) ||
            a <=
                0
        ) {
            return false;
        }

        return [
            1,
            2,
            0.5
        ].some(
            factor =>
                Math.abs(
                    a -
                        b *
                            factor
                ) /
                    a <=
                    HARMONIC_BPM_TOLERANCE
        );
    }

    function currentHarmonicReference() {
        const id =
            currentVideoId();

        let bpm =
            null;

        let keyIndex =
            null;

        let scale =
            null;

        if (
            id &&
            trackAnalysisTrackId ===
                id
        ) {
            bpm =
                trackAnalysisBpm;

            keyIndex =
                trackAnalysisKeyIndex;

            scale =
                trackAnalysisScale;
        }

        const stored =
            id
                ? trackAnalysisMemory[
                    id
                ]
                : null;

        if (stored) {
            if (
                !Number.isFinite(
                    bpm
                )
            ) {
                bpm =
                    stored.b;
            }

            if (
                !Number.isInteger(
                    keyIndex
                )
            ) {
                keyIndex =
                    stored.k;

                scale =
                    stored.s;
            }
        }

        return {
            bpm:
                Number.isFinite(
                    bpm
                )
                    ? bpm
                    : null,
            camelot:
                parseCamelotCode(
                    camelotCodeFor(
                        keyIndex,
                        scale
                    )
                )
        };
    }

    function selectHarmonicCandidate() {
        if (
            !harmonicMixEnabled ||
            Math.random() >
                HARMONIC_PICK_CHANCE
        ) {
            return null;
        }

        const reference =
            currentHarmonicReference();

        if (
            !reference.camelot &&
            !reference.bpm
        ) {
            return null;
        }

        const seen =
            getSeen();

        const currentId =
            currentVideoId();

        let bestScore =
            0;

        let best =
            [];

        for (
            const handle
            of getEnabledChannels()
        ) {
            for (
                const video
                of videosForChannel(
                    handle
                )
            ) {
                const id =
                    video?.videoId;

                const stored =
                    id
                        ? trackAnalysisMemory[
                            id
                        ]
                        : null;

                if (
                    !stored ||
                    id ===
                        currentId ||
                    seen.has(
                        id
                    ) ||
                    !videoMatchesEra(
                        video
                    )
                ) {
                    continue;
                }

                const camelot =
                    parseCamelotCode(
                        camelotCodeFor(
                            stored.k,
                            stored.s
                        )
                    );

                const keyCheck =
                    reference.camelot &&
                    camelot
                        ? camelotCompatible(
                            reference.camelot,
                            camelot
                        )
                        : null;

                const bpmCheck =
                    reference.bpm &&
                    Number.isFinite(
                        stored.b
                    )
                        ? bpmCompatible(
                            reference.bpm,
                            stored.b
                        )
                        : null;

                // Never pick a known clash; need at least one positive match.
                if (
                    keyCheck ===
                        false ||
                    bpmCheck ===
                        false ||
                    (
                        !keyCheck &&
                        !bpmCheck
                    )
                ) {
                    continue;
                }

                const score =
                    (
                        keyCheck
                            ? 2
                            : 0
                    ) +
                    (
                        bpmCheck
                            ? 1
                            : 0
                    );

                if (
                    score >
                        bestScore
                ) {
                    bestScore =
                        score;

                    best =
                        [
                            video
                        ];

                } else if (
                    score ===
                        bestScore
                ) {
                    best.push(
                        video
                    );
                }
            }
        }

        return randomItem(
            best
        );
    }

    // ---------------- LABEL / ARTIST RADIO ----------------

    function normalizeMatchText(
        value
    ) {
        return String(
            value ||
            ''
        )
            .normalize(
                'NFKD'
            )
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                ''
            );
    }

    function normalizeLabelMatchName(
        value
    ) {
        return normalizeMatchText(
            String(
                value ||
                ''
            )
                .replace(
                    /\b(?:records?|recordings?|rec\.?)\b/gi,
                    ' '
                )
        );
    }

    function catalogueFamily(
        code
    ) {
        let text =
            String(
                code ||
                ''
            )
                .replace(
                    /\u200b/g,
                    ''
                )
                .toUpperCase()
                .trim()
                .replace(
                    /[\s\-_.]+$/,
                    ''
                );

        if (
            !text ||
            /\s/.test(
                text
            ) ||
            /FULL ALBUM/.test(
                text
            )
        ) {
            return '';
        }

        text =
            text
                // Sub-volume suffixes such as SEMANTICA130.3 or HOS-357.
                .replace(
                    /(?:[.\-_]\d+[A-Z]?)+$/,
                    ''
                )
                .replace(
                    /[\s\-_.]*\d+[A-Z]{0,3}$/,
                    ''
                )
                .replace(
                    /[\s\-_.]+$/,
                    ''
                )
                .replace(
                    /[-_ ]?(?:LP|EP|DGTL|DIGITAL|LTD|CD)$/,
                    ''
                )
                .replace(
                    /[\s\-_.]+$/,
                    ''
                );

        return (
            text.length >=
                2 &&
            /[A-Z]/.test(
                text
            )
        )
            ? text
            : '';
    }

    function catalogueFamilyFromTitle(
        title
    ) {
        const codes =
            [
                ...String(
                    title ||
                    ''
                ).matchAll(
                    /\[([^\]]+)\]/g
                )
            ]
                .map(
                    match =>
                        match[1]
                );

        for (
            let index =
                codes.length -
                1;
            index >=
                0;
            index--
        ) {
            const family =
                catalogueFamily(
                    codes[
                        index
                    ]
                );

            if (family) {
                return family;
            }
        }

        return '';
    }

    function labelNamesFromTitle(
        title
    ) {
        const names =
            [];

        const text =
            String(
                title ||
                ''
            );

        for (
            const match
            of text.matchAll(
                /【([^】]+)】/g
            )
        ) {
            names.push(
                normalizeLabelMatchName(
                    match[1]
                )
            );
        }

        // Bracketed label names such as "[Accents Records]" (contain a space).
        for (
            const match
            of text.matchAll(
                /\[([^\]]*\s[^\]]*)\]/g
            )
        ) {
            if (
                !/full album/i.test(
                    match[1]
                )
            ) {
                names.push(
                    normalizeLabelMatchName(
                        match[1]
                    )
                );
            }
        }

        return names.filter(
            Boolean
        );
    }

    function artistNamesFromTitle(
        title
    ) {
        let text =
            String(
                title ||
                ''
            );

        const pipe =
            text
                .split(
                    '|'
                )
                .map(
                    part =>
                        part.trim()
                )
                .find(
                    part =>
                        /\s[-–—]\s/.test(
                            part
                        )
                );

        if (pipe) {
            text =
                pipe;
        }

        const names =
            [];

        const split =
            text.match(
                /^(.+?)\s[-–—]\s(.+)$/
            );

        if (split) {
            for (
                const part
                of split[1].split(
                    /\s*(?:&|,|\+|\bx\b|\bfeat\.?|\bft\.?|\band\b|\bvs\.?)\s*/i
                )
            ) {
                names.push(
                    normalizeMatchText(
                        part
                    )
                );
            }
        }

        // Remix / edit credits count as an appearance by that artist.
        for (
            const match
            of text.matchAll(
                /\(([^()]+?)\s+(?:remix|rework|edit|version|dub|mix)\)/gi
            )
        ) {
            names.push(
                normalizeMatchText(
                    match[1]
                )
            );
        }

        return names.filter(
            name =>
                name.length >=
                    2
        );
    }

    function getFocusState() {
        const state =
            readSessionObject(
                SESSION_FOCUS_KEY
            );

        if (
            !state ||
            !state.active ||
            !Array.isArray(
                state.ids
            ) ||
            !state.ids.length
        ) {
            return null;
        }

        return state;
    }

    function isFocusActive() {
        return Boolean(
            getFocusState()
        );
    }

    function clearFocusState() {
        try {
            sessionStorage.removeItem(
                SESSION_FOCUS_KEY
            );

        } catch {}
    }

    function allLibraryVideos() {
        const videos =
            [];

        const seenIds =
            new Set();

        for (
            const handle
            of Object.keys(
                cache
            )
        ) {
            for (
                const video
                of videosForChannel(
                    handle
                )
            ) {
                if (
                    video?.videoId &&
                    !seenIds.has(
                        video.videoId
                    )
                ) {
                    seenIds.add(
                        video.videoId
                    );

                    videos.push(
                        video
                    );
                }
            }
        }

        return videos;
    }

    function buildFocusPool(
        type
    ) {
        const id =
            currentVideoId();

        const current =
            findVideoById(
                id
            );

        const title =
            current?.title ||
            document.title.replace(
                /\s*-\s*YouTube\s*$/i,
                ''
            );

        const releaseInfo =
            getCurrentReleaseInfo();

        if (
            type ===
                'artist'
        ) {
            const name =
                releaseInfo?.artist?.name ||
                artistNameFromYouTubeTitle();

            const target =
                normalizeMatchText(
                    name
                );

            if (
                target.length <
                    2
            ) {
                return null;
            }

            const ids =
                allLibraryVideos()
                    .filter(
                        video =>
                            artistNamesFromTitle(
                                video.title
                            ).includes(
                                target
                            )
                    )
                    .map(
                        video =>
                            video.videoId
                    );

            return {
                type,
                name,
                ids
            };
        }

        const families =
            new Set();

        const names =
            new Set();

        const titleFamily =
            catalogueFamilyFromTitle(
                title
            );

        if (titleFamily) {
            families.add(
                titleFamily
            );
        }

        const metadataFamily =
            catalogueFamily(
                descriptionMetadata()
                    .catalogue
            );

        if (metadataFamily) {
            families.add(
                metadataFamily
            );
        }

        for (
            const labelName
            of labelNamesFromTitle(
                title
            )
        ) {
            names.add(
                labelName
            );
        }

        const labelName =
            releaseInfo?.label?.name ||
            '';

        if (
            normalizeLabelMatchName(
                labelName
            ).length >=
                3
        ) {
            names.add(
                normalizeLabelMatchName(
                    labelName
                )
            );
        }

        if (
            !families.size &&
            !names.size
        ) {
            return null;
        }

        const ids =
            allLibraryVideos()
                .filter(
                    video => {
                        const family =
                            catalogueFamilyFromTitle(
                                video.title
                            );

                        if (
                            family &&
                            families.has(
                                family
                            )
                        ) {
                            return true;
                        }

                        return labelNamesFromTitle(
                            video.title
                        ).some(
                            value =>
                                names.has(
                                    value
                                )
                        );
                    }
                )
                .map(
                    video =>
                        video.videoId
                );

        return {
            type,
            name:
                labelName ||
                [
                    ...families
                ][0] ||
                'Label',
            ids
        };
    }

    function startFocusRadio(
        type
    ) {
        const pool =
            buildFocusPool(
                type
            );

        const current =
            currentVideoId();

        const others =
            pool
                ? pool.ids.filter(
                    id =>
                        id !==
                            current
                )
                : [];

        if (
            !pool ||
            others.length <
                1
        ) {
            setStatus(
                type ===
                    'artist'
                    ? 'No other tracks by this artist in the library'
                    : 'No other tracks from this label in the library'
            );

            flashFocusBar(
                type ===
                    'artist'
                    ? 'NO OTHER TRACKS BY THIS ARTIST'
                    : 'NO OTHER TRACKS FROM THIS LABEL'
            );

            return false;
        }

        clearFavouritesPlaylistState();

        writeSessionObject(
            SESSION_FOCUS_KEY,
            {
                active:
                    true,
                type:
                    pool.type,
                name:
                    pool.name,
                ids:
                    pool.ids,
                startedAt:
                    Date.now()
            }
        );

        setStatus(
            `${type === 'artist' ? 'Artist' : 'Label'} radio · ${pool.name} · ${pool.ids.length} tracks`
        );

        updateUI();

        return true;
    }

    function exitFocusRadio() {
        clearFocusState();

        setStatus(
            'Returned to STRATA discovery'
        );

        updateUI();
    }

    function selectFocusCandidate() {
        const state =
            getFocusState();

        if (!state) {
            return null;
        }

        const seen =
            getSeen();

        const current =
            currentVideoId();

        const recentHistory =
            new Set(
                getHistory()
                    .slice(
                        -Math.min(
                            8,
                            Math.floor(
                                state.ids.length /
                                    2
                            )
                        )
                    )
            );

        const resolve =
            ids =>
                ids
                    .map(
                        id =>
                            findVideoById(
                                id
                            )
                    )
                    .filter(
                        Boolean
                    );

        let candidates =
            resolve(
                state.ids.filter(
                    id =>
                        id !==
                            current &&
                        !seen.has(
                            id
                        )
                )
            );

        // Pool exhausted this session: loop it, avoiding the last few plays.
        if (
            !candidates.length
        ) {
            candidates =
                resolve(
                    state.ids.filter(
                        id =>
                            id !==
                                current &&
                            !recentHistory.has(
                                id
                            )
                    )
                );
        }

        if (
            !candidates.length
        ) {
            candidates =
                resolve(
                    state.ids.filter(
                        id =>
                            id !==
                                current
                    )
                );
        }

        return randomItem(
            candidates
        );
    }

    function renderFocusBar() {
        const bar =
            document.getElementById(
                'strata-focus-bar'
            );

        if (!bar) {
            return;
        }

        if (
            bar.dataset.flashing ===
                '1'
        ) {
            return;
        }

        const state =
            getFocusState();

        bar.replaceChildren();

        if (!state) {
            bar.classList.remove(
                'visible'
            );

            return;
        }

        const copy =
            el(
                'span',
                {
                    className:
                        'strata-focus-copy',
                    text:
                        `${state.type === 'artist' ? 'ARTIST' : 'LABEL'} RADIO · ${state.name} · ${state.ids.length.toLocaleString()} TRACKS`,
                    title:
                        state.name
                }
            );

        const exit =
            btn(
                '',
                '×',
                'Return to STRATA discovery'
            );

        exit.className =
            'strata-focus-exit';

        exit.addEventListener(
            'click',
            event => {
                event.stopPropagation();
                exitFocusRadio();
            }
        );

        bar.append(
            copy,
            exit
        );

        bar.classList.add(
            'visible'
        );
    }

    function flashFocusBar(
        text
    ) {
        const bar =
            document.getElementById(
                'strata-focus-bar'
            );

        if (!bar) {
            return;
        }

        bar.dataset.flashing =
            '1';

        bar.replaceChildren(
            el(
                'span',
                {
                    className:
                        'strata-focus-copy',
                    text
                }
            )
        );

        bar.classList.add(
            'visible',
            'notice'
        );

        setTimeout(
            () => {
                bar.dataset.flashing =
                    '';

                bar.classList.remove(
                    'notice'
                );

                renderFocusBar();
            },
            2200
        );
    }

    // ---------------- MEDIA KEYS / SHORTCUTS ----------------

    function applyMediaSessionHandlers() {
        const mediaSession =
            navigator.mediaSession;

        if (
            !mediaSession ||
            typeof mediaSession.setActionHandler !==
                'function' ||
            !isCurrentVideoStrataOwned()
        ) {
            return;
        }

        try {
            mediaSession.setActionHandler(
                'nexttrack',
                () => {
                    console.log(
                        '[STRATA] media key · next'
                    );

                    playNext();
                }
            );
        } catch {}

        try {
            mediaSession.setActionHandler(
                'previoustrack',
                () => {
                    console.log(
                        '[STRATA] media key · previous'
                    );

                    playPrevious();
                }
            );
        } catch {}
    }

    function flashFavouriteFeedback() {
        for (
            const id
            of [
                'strata-favourite',
                'strata-mini-favourite'
            ]
        ) {
            const node =
                document.getElementById(
                    id
                );

            if (!node) {
                continue;
            }

            node.classList.remove(
                'strata-fav-flash'
            );

            // Restart the animation.
            void node.offsetWidth;

            node.classList.add(
                'strata-fav-flash'
            );
        }
    }

    /*
        v8.5.83 keyboard shortcuts (watch page, library tracks only):
            Enter      favourite
            -          previous   (main row or numpad)
            = / +      next       (the +/= key, no Shift needed, or numpad +)
        Ignored while typing in search, comments or any input field.
        Captured before YouTube so its caption-size +/- keys don't fire.
    */

    let lastSkipShortcutAt =
        0;

    function shortcutActionFor(
        event
    ) {
        if (
            event.key ===
                'Enter'
        ) {
            return event.shiftKey
                ? null
                : 'favourite';
        }

        if (
            event.code ===
                'Minus' ||
            event.code ===
                'NumpadSubtract' ||
            event.key ===
                '-'
        ) {
            return 'previous';
        }

        if (
            event.code ===
                'Equal' ||
            event.code ===
                'NumpadAdd' ||
            event.key ===
                '+' ||
            event.key ===
                '='
        ) {
            return 'next';
        }

        return null;
    }

    function installKeyboardShortcuts() {
        document.addEventListener(
            'keydown',
            event => {
                if (
                    event.repeat ||
                    event.ctrlKey ||
                    event.altKey ||
                    event.metaKey ||
                    event.isComposing
                ) {
                    return;
                }

                const action =
                    shortcutActionFor(
                        event
                    );

                if (!action) {
                    return;
                }

                const target =
                    event.target;

                if (
                    target &&
                    (
                        target.isContentEditable ||
                        (
                            typeof target.closest ===
                                'function' &&
                            target.closest(
                                'input, textarea, select, button, a, [contenteditable], ytd-searchbox, #search, tp-yt-paper-dialog, ytd-commentbox'
                            )
                        )
                    )
                ) {
                    return;
                }

                const id =
                    currentVideoId();

                if (
                    !id ||
                    !findVideoById(
                        id
                    )
                ) {
                    return;
                }

                event.preventDefault();
                event.stopImmediatePropagation();

                if (
                    action ===
                        'favourite'
                ) {
                    toggleFavourite();

                    flashFavouriteFeedback();

                    setStatus(
                        favourites[
                            id
                        ]
                            ? 'Added to favourites'
                            : 'Removed from favourites'
                    );

                    return;
                }

                // Guard against a double press firing two navigations.
                const now =
                    Date.now();

                if (
                    now -
                        lastSkipShortcutAt <
                        700
                ) {
                    return;
                }

                lastSkipShortcutAt =
                    now;

                setStatus(
                    `Keyboard · ${action}`
                );

                if (
                    action ===
                        'next'
                ) {
                    playNext();

                } else {
                    playPrevious();
                }
            },
            true
        );
    }

    // ============================================================
    // PLAYBACK
    // ============================================================

    function currentVideoId() {
        const href =
            location.href;

        if (
            href ===
                cachedLocationHref
        ) {
            return cachedLocationVideoId;
        }

        cachedLocationHref =
            href;

        try {
            cachedLocationVideoId =
                new URL(
                    href
                )
                    .searchParams
                    .get(
                        'v'
                    );

        } catch {
            cachedLocationVideoId =
                null;
        }

        return cachedLocationVideoId;
    }

    function readSessionValue(
        key
    ) {
        try {
            return sessionStorage.getItem(
                key
            );

        } catch {
            return null;
        }
    }

    function writeSessionValue(
        key,
        value
    ) {
        try {
            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                sessionStorage.removeItem(
                    key
                );

            } else {
                sessionStorage.setItem(
                    key,
                    String(
                        value
                    )
                );
            }

        } catch {}
    }

    function getOwnedVideoId() {
        return readSessionValue(
            SESSION_OWNED_VIDEO_KEY
        );
    }

    function getExpectedVideoId() {
        return readSessionValue(
            SESSION_EXPECTED_VIDEO_KEY
        );
    }

    function markStrataNavigation(
        videoId
    ) {
        if (!videoId) {
            return;
        }

        writeSessionValue(
            SESSION_OWNED_VIDEO_KEY,
            videoId
        );

        writeSessionValue(
            SESSION_EXPECTED_VIDEO_KEY,
            videoId
        );
    }

    function clearExpectedVideo() {
        writeSessionValue(
            SESSION_EXPECTED_VIDEO_KEY,
            null
        );
    }

    function isCurrentVideoStrataOwned() {
        const id =
            currentVideoId();

        return Boolean(
            id &&
            getOwnedVideoId() ===
                id
        );
    }

    /*
        Called only during a fresh script/page load.

        If the tab was already on a STRATA-owned video, sessionStorage
        proves ownership. As a one-time refresh fallback, a video that is
        present in STRATA's cache may also be adopted so refreshing a
        genuine STRATA track still starts automatically.
    */

    function adoptInitialStrataVideo() {
        const id =
            currentVideoId();

        if (!id) {
            return false;
        }

        const expected =
            getExpectedVideoId();

        if (
            expected &&
            expected === id
        ) {
            writeSessionValue(
                SESSION_OWNED_VIDEO_KEY,
                id
            );

            clearExpectedVideo();

            return true;
        }

        if (
            getOwnedVideoId() === id
        ) {
            return true;
        }

        if (
            findVideoById(
                id
            )
        ) {
            writeSessionValue(
                SESSION_OWNED_VIDEO_KEY,
                id
            );

            return true;
        }

        return false;
    }

    function getFavouriteTracksSorted() {
        return Object.values(
            favourites
        )
            .filter(
                track =>
                    track &&
                    track.videoId
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    (
                        b.savedAt ||
                        0
                    ) -
                    (
                        a.savedAt ||
                        0
                    )
            );
    }

    function getFavouritesPlaylistState() {
        const saved =
            readSessionObject(
                SESSION_FAVOURITES_PLAYLIST_KEY
            );

        if (
            !saved ||
            !saved.active ||
            !Array.isArray(
                saved.queue
            ) ||
            !saved.queue.length
        ) {
            return null;
        }

        const queue = [
            ...new Set(
                saved.queue.filter(
                    videoId =>
                        typeof videoId ===
                            'string' &&
                        videoId
                )
            )
        ];

        if (!queue.length) {
            return null;
        }

        const numericIndex =
            Number(
                saved.index
            );

        const index =
            Number.isFinite(
                numericIndex
            )
                ? Math.min(
                    Math.max(
                        0,
                        Math.trunc(
                            numericIndex
                        )
                    ),
                    queue.length -
                        1
                )
                : 0;

        return {
            active:
                true,

            queue,

            index,

            shuffled:
                Boolean(
                    saved.shuffled
                ),

            ended:
                Boolean(
                    saved.ended
                ),

            startedAt:
                Number(
                    saved.startedAt
                ) ||
                Date.now()
        };
    }

    function saveFavouritesPlaylistState(
        state
    ) {
        if (
            !state ||
            !state.active ||
            !Array.isArray(
                state.queue
            ) ||
            !state.queue.length
        ) {
            clearFavouritesPlaylistState();
            return;
        }

        writeSessionObject(
            SESSION_FAVOURITES_PLAYLIST_KEY,
            {
                active:
                    true,

                queue:
                    state.queue,

                index:
                    state.index ||
                    0,

                shuffled:
                    Boolean(
                        state.shuffled
                    ),

                ended:
                    Boolean(
                        state.ended
                    ),

                startedAt:
                    state.startedAt ||
                    Date.now()
            }
        );
    }

    function clearFavouritesPlaylistState() {
        try {
            sessionStorage.removeItem(
                SESSION_FAVOURITES_PLAYLIST_KEY
            );

        } catch {}
    }

    function isFavouritesPlaylistActive() {
        return Boolean(
            getFavouritesPlaylistState()
        );
    }

    function shuffleVideoIds(
        ids
    ) {
        const shuffled = [
            ...ids
        ];

        for (
            let index =
                shuffled.length -
                1;
            index >
                0;
            index--
        ) {
            const swapIndex =
                Math.floor(
                    Math.random() *
                    (
                        index +
                        1
                    )
                );

            [
                shuffled[
                    index
                ],
                shuffled[
                    swapIndex
                ]
            ] = [
                shuffled[
                    swapIndex
                ],
                shuffled[
                    index
                ]
            ];
        }

        return shuffled;
    }

    function syncFavouritesPlaylistToCurrent() {
        const state =
            getFavouritesPlaylistState();

        if (!state) {
            return null;
        }

        const current =
            currentVideoId();

        if (!current) {
            return state;
        }

        const index =
            state.queue.indexOf(
                current
            );

        if (
            index >=
                0 &&
            state.index !==
                index
        ) {
            state.index =
                index;

            saveFavouritesPlaylistState(
                state
            );
        }

        return state;
    }

    function navigateFavouritesPlaylistTo(
        index
    ) {
        const state =
            getFavouritesPlaylistState();

        if (!state) {
            return false;
        }

        if (
            index <
                0 ||
            index >=
                state.queue.length
        ) {
            return false;
        }

        const videoId =
            state.queue[
                index
            ];

        if (!videoId) {
            return false;
        }

        state.index =
            index;

        state.ended =
            false;

        saveFavouritesPlaylistState(
            state
        );

        // Claim the exact destination before any non-critical UI/storage
        // work. This narrows the window in which YouTube native autoplay
        // can briefly navigate somewhere else.
        markStrataNavigation(
            videoId
        );

        persistPanelSectionState();
        persistPanelPosition();

        strataNavigate(
            videoId
        );

        return true;
    }

    function startFavouritesPlaylist(
        shuffled =
            false
    ) {
        const tracks =
            getFavouriteTracksSorted();

        if (!tracks.length) {
            setStatus(
                'No favourite tracks saved'
            );

            return false;
        }

        let queue =
            tracks.map(
                track =>
                    track.videoId
            );

        if (shuffled) {
            queue =
                shuffleVideoIds(
                    queue
                );
        }

        const state = {
            active:
                true,

            queue,

            index:
                0,

            shuffled:
                Boolean(
                    shuffled
                ),

            ended:
                false,

            startedAt:
                Date.now()
        };

        clearFocusState();

        saveFavouritesPlaylistState(
            state
        );

        updateUI();

        return navigateFavouritesPlaylistTo(
            0
        );
    }

    function playNextFavourite() {
        const state =
            syncFavouritesPlaylistToCurrent() ||
            getFavouritesPlaylistState();

        if (!state) {
            return false;
        }

        const nextIndex =
            state.index +
            1;

        if (
            nextIndex >=
            state.queue.length
        ) {
            state.ended =
                true;

            saveFavouritesPlaylistState(
                state
            );

            setStatus(
                'End of favourites playlist'
            );

            updateUI();

            return true;
        }

        return navigateFavouritesPlaylistTo(
            nextIndex
        );
    }

    function playPreviousFavourite() {
        const state =
            syncFavouritesPlaylistToCurrent() ||
            getFavouritesPlaylistState();

        if (!state) {
            return false;
        }

        const previousIndex =
            state.index -
            1;

        if (
            previousIndex <
            0
        ) {
            setStatus(
                'Start of favourites playlist'
            );

            updateUI();

            return true;
        }

        return navigateFavouritesPlaylistTo(
            previousIndex
        );
    }

    function exitFavouritesPlaylist() {
        clearFavouritesPlaylistState();

        setStatus(
            'Returned to STRATA discovery'
        );

        updateUI();
    }

    function playNext() {
        if (
            isFavouritesPlaylistActive()
        ) {
            playNextFavourite();
            return;
        }

        if (
            !getEnabledChannels()
                .length
        ) {
            setStatus(
                'Enable at least one channel'
            );

            return;
        }

        const chosen =
            pickRandomVideo();

        if (!chosen) {
            setStatus(
                getUniqueTotal()
                    ? 'No unused tracks remain this session'
                    : 'Building library…'
            );

            return;
        }

        // Claim the next STRATA target immediately. The expected-video
        // marker is now established before history/panel bookkeeping.
        markStrataNavigation(
            chosen.videoId
        );

        const current =
            currentVideoId();

        if (current) {
            const history =
                getHistory();

            history.push(
                current
            );

            saveHistory(
                history
            );
        }

        persistPanelSectionState();
        persistPanelPosition();

        strataNavigate(
            chosen.videoId
        );
    }

    function playPrevious() {
        if (
            isFavouritesPlaylistActive()
        ) {
            playPreviousFavourite();
            return;
        }

        const history =
            getHistory();

        const previous =
            history.pop();

        if (!previous) {
            setStatus(
                'No previous STRATA track'
            );

            return;
        }

        saveHistory(
            history
        );

        markStrataNavigation(
            previous
        );

        persistPanelSectionState();
        persistPanelPosition();

        strataNavigate(
            previous
        );
    }

    // ============================================================
    // FAVOURITES
    // ============================================================

    function toggleFavourite() {
        const id =
            currentVideoId();

        if (!id) {
            return;
        }

        const video =
            findVideoById(
                id
            );

        if (!video) {
            return;
        }

        if (
            favourites[
                id
            ]
        ) {
            delete favourites[
                id
            ];

        } else {
            favourites[
                id
            ] = {
                ...video,

                savedAt:
                    Date.now()
            };
        }

        saveFavourites();

        updateNowPlaying();

        updateUI();
    }

    function capitalizeDisplayStart(
        value
    ) {
        const text =
            String(
                value ||
                    ''
            );

        return text.replace(
            /^([^A-Za-zÀ-ÖØ-öø-ÿ]*)([A-Za-zÀ-ÖØ-öø-ÿ])/u,
            (
                match,
                prefix,
                firstLetter
            ) =>
                `${prefix}${firstLetter.toLocaleUpperCase()}`
        );
    }

    function capitalizeDisplayWords(
        value
    ) {
        const text =
            String(
                value ||
                    ''
            );

        return text.replace(
            /(^|[\s\-–—/(&[\]'".])([A-Za-zÀ-ÖØ-öø-ÿ])/gu,
            (
                match,
                prefix,
                firstLetter
            ) =>
                `${prefix}${firstLetter.toLocaleUpperCase()}`
        );
    }

    function cleanNowPlayingTitle(
        value
    ) {
        let text =
            String(
                value ||
                    ''
            )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (!text) {
            return '';
        }

        /*
            Strip only trailing square-style label/catalogue metadata.
            Parenthesised remix names remain untouched.
        */

        text =
            text
                .replace(
                    /\s*(?:\[[^\]]+\]|【[^】]+】)\s*$/,
                    ''
                )
                .trim();

        /*
            Normalise only the first artist/track separator for display.
            The stored YouTube/master title is never changed.
        */

        text =
            text.replace(
                /\s+(?:-|–|—)\s+/,
                ' - '
            );

        const separator =
            ' - ';

        const separatorIndex =
            text.indexOf(
                separator
            );

        if (
            separatorIndex <
                0
        ) {
            return capitalizeDisplayWords(
                text
            );
        }

        const artist =
            text.slice(
                0,
                separatorIndex
            );

        const track =
            text.slice(
                separatorIndex +
                    separator.length
            );

        return `${capitalizeDisplayWords(artist)}${separator}${capitalizeDisplayWords(track)}`;
    }

    function updateNowPlaying() {
        const id =
            currentVideoId();

        const video =
            findVideoById(
                id
            );

        const title =
            document.getElementById(
                'strata-now-title'
            );

        const channel =
            document.getElementById(
                'strata-now-channel'
            );

        const favourite =
            document.getElementById(
                'strata-favourite'
            );

        const miniFavourite =
            document.getElementById(
                'strata-mini-favourite'
            );

        if (title) {
            const rawTitle =
                video?.title ||
                document.title
                    .replace(
                        ' - YouTube',
                        ''
                    );

            title.textContent =
                cleanNowPlayingTitle(
                    rawTitle
                );

            title.title =
                rawTitle;
        }

        if (channel) {
            channel.textContent =
                video?.channelHandle ||
                '';
        }

        const isFavourite =
            Boolean(
                favourites[
                    id
                ]
            );

        if (favourite) {
            favourite.textContent =
                isFavourite
                    ? '♥'
                    : '♡';

            favourite.classList.toggle(
                'active',
                isFavourite
            );

            favourite.title =
                isFavourite
                    ? 'Remove from favourites · shortcut: Enter'
                    : 'Favourite · shortcut: Enter';
        }

        if (miniFavourite) {
            miniFavourite.textContent =
                isFavourite
                    ? '♥'
                    : '♡';

            miniFavourite.classList.toggle(
                'active',
                isFavourite
            );

            miniFavourite.title =
                isFavourite
                    ? 'Remove current track from favourites · shortcut: Enter'
                    : 'Favourite current track · shortcut: Enter';
        }
    }

    // ============================================================
    // LINKS — URL EXTRACTION
    // ============================================================

    function cleanLinkText(
        value
    ) {
        if (!value) {
            return null;
        }

        let url =
            String(
                value
            )
                .trim()
                .replace(
                    /[)\]}>.,;!?]+$/g,
                    ''
                );

        if (
            url.startsWith(
                'www.'
            )
        ) {
            url =
                'https://' +
                url;
        }

        return (
            /^https?:\/\//i
                .test(
                    url
                )
                ? url
                : null
        );
    }

    function unwrapYouTubeRedirect(
        value
    ) {
        try {
            const url =
                new URL(
                    value
                );

            if (
                (
                    url.hostname ===
                        'youtube.com' ||
                    url.hostname ===
                        'www.youtube.com'
                ) &&
                url.pathname ===
                    '/redirect'
            ) {
                return (
                    url.searchParams.get(
                        'q'
                    ) ||
                    url.searchParams.get(
                        'url'
                    ) ||
                    value
                );
            }

        } catch {}

        return value;
    }

    function classifyMusicUrl(
        value
    ) {
        try {
            const unwrapped =
                unwrapYouTubeRedirect(
                    value
                );

            const url =
                new URL(
                    unwrapped
                );

            url.hash =
                '';

            const host =
                url.hostname
                    .toLowerCase()
                    .replace(
                        /^www\./,
                        ''
                    );

            const service =
                MUSIC_SERVICES.find(
                    item =>
                        item.test(
                            host
                        )
                );

            if (!service) {
                return null;
            }

            return {
                service:
                    service.name,

                url:
                    url.toString(),

                host,

                pathname:
                    url.pathname
                        .toLowerCase()
            };

        } catch {
            return null;
        }
    }

    function scoreLink(
        link,
        source
    ) {
        let score =
            source ===
                'Description'
                ? 100
                : 25;

        if (
            link.service ===
            'Bandcamp'
        ) {
            if (
                link.pathname.includes(
                    '/track/'
                )
            ) {
                score +=
                    120;

            } else if (
                link.pathname.includes(
                    '/album/'
                )
            ) {
                score +=
                    110;

            } else if (
                link.pathname.includes(
                    '/merch'
                )
            ) {
                score -=
                    100;
            }
        }

        if (
            link.service ===
            'Discogs'
        ) {
            if (
                link.pathname.includes(
                    '/release/'
                )
            ) {
                score +=
                    120;

            } else if (
                link.pathname.includes(
                    '/master/'
                )
            ) {
                score +=
                    110;

            } else if (
                link.pathname.includes(
                    '/artist/'
                )
            ) {
                score +=
                    20;

            } else if (
                link.pathname.includes(
                    '/label/'
                )
            ) {
                score +=
                    15;
            }
        }

        return score;
    }

    function addMusicLink(
        candidates,
        rawUrl,
        source
    ) {
        const cleaned =
            cleanLinkText(
                rawUrl
            );

        if (!cleaned) {
            return;
        }

        const match =
            classifyMusicUrl(
                cleaned
            );

        if (!match) {
            return;
        }

        const normalized =
            match.url
                .replace(
                    /\/$/,
                    ''
                )
                .toLowerCase();

        const existing =
            candidates.find(
                candidate =>
                    candidate.normalized ===
                    normalized
            );

        if (existing) {
            if (
                scoreLink(
                    match,
                    source
                ) >
                scoreLink(
                    existing,
                    existing.source
                )
            ) {
                Object.assign(
                    existing,
                    match,
                    {
                        source,
                        normalized
                    }
                );
            }

            return;
        }

        candidates.push({
            ...match,
            source,
            normalized
        });
    }

    function extractLinksFromText(
        text,
        candidates,
        source
    ) {
        if (!text) {
            return;
        }

        const urls =
            String(
                text
            ).match(
                /(?:https?:\/\/|www\.)[^\s<>"']+/gi
            ) ||
            [];

        for (
            const url
            of urls
        ) {
            addMusicLink(
                candidates,
                url,
                source
            );
        }
    }

    function descriptionRoots() {
        /*
            Current YouTube watch pages can contain several elements with
            description-ish IDs. Some are legacy shells and some belong to
            the channel/about cards that appear below the real description.

            Prefer the exact watch-metadata inline expander that our live DOM
            test proved contains the uploader's real description anchors.
            Only use the older selectors as a fallback for older renderers.
        */

        const primary =
            document.querySelector(
                'ytd-watch-metadata #description-inline-expander'
            );

        if (primary) {
            return [primary];
        }

        const selectors = [
            'ytd-watch-metadata #description-inner',
            'ytd-watch-metadata ytd-text-inline-expander',
            'ytd-watch-metadata #description',
            'ytd-watch-flexy #description'
        ];

        const seen =
            new Set();

        const roots =
            [];

        for (
            const selector
            of selectors
        ) {
            for (
                const node
                of document.querySelectorAll(
                    selector
                )
            ) {
                if (
                    node &&
                    !seen.has(
                        node
                    )
                ) {
                    seen.add(
                        node
                    );

                    roots.push(
                        node
                    );
                }
            }
        }

        return roots;
    }

    function descriptionLooksReady() {
        const roots =
            descriptionRoots();

        return roots.some(
            root => {
                const text =
                    String(
                        root.innerText ||
                        root.textContent ||
                        ''
                    ).trim();

                const anchors =
                    root.querySelectorAll(
                        'a[href]'
                    ).length;

                return (
                    text.length >
                        40 &&
                    (
                        anchors >
                            0 ||
                        /(?:https?:\/\/|www\.|buy links?|follow artist|follow label|artist\s*:|label\s*:)/i
                            .test(
                                text
                            )
                    )
                );
            }
        );
    }

    function wait(
        ms
    ) {
        return new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    ms
                )
        );
    }

    async function waitForDescriptionReady(
        timeoutMs = 6000
    ) {
        const started =
            Date.now();

        while (
            Date.now() -
                started <
            timeoutMs
        ) {
            if (
                descriptionLooksReady()
            ) {
                /*
                    Give YouTube one extra animation frame to finish
                    attaching redirect URLs to description anchors.
                */

                await new Promise(
                    resolve =>
                        requestAnimationFrame(
                            resolve
                        )
                );

                return true;
            }

            await wait(
                250
            );
        }

        return descriptionLooksReady();
    }

    function elementIsVisible(
        node
    ) {
        if (!node) {
            return false;
        }

        const style =
            getComputedStyle(
                node
            );

        return (
            style.display !==
                'none' &&
            style.visibility !==
                'hidden' &&
            style.opacity !==
                '0' &&
            node.getClientRects()
                .length >
                0
        );
    }

    async function prepareDescriptionForLinkScan() {
        /*
            YouTube currently keeps many external description anchors out of
            the useful DOM until the user opens "...more". A collapsed
            description can therefore look ready while exposing only a
            hashtag, causing STRATA to report "No release links found".

            Open the real watch-description locally, wait for its anchors to
            hydrate, scan it, then restore the user's collapsed state later.
            This performs no STRATA background YouTube request; it only reads
            the already-loaded watch-page DOM.
        */

        let root =
            document.querySelector(
                'ytd-watch-metadata #description-inline-expander'
            );

        const started =
            Date.now();

        while (
            !root &&
            Date.now() -
                started <
                2500
        ) {
            await wait(
                125
            );

            root =
                document.querySelector(
                    'ytd-watch-metadata #description-inline-expander'
                );
        }

        if (!root) {
            return {
                root:
                    currentDescriptionRoot(),
                openedByStrata:
                    false
            };
        }

        const expand =
            root.querySelector(
                '#expand'
            );

        const beforeAnchors =
            root.querySelectorAll(
                'a[href]'
            ).length;

        let openedByStrata =
            false;

        if (
            expand &&
            elementIsVisible(
                expand
            )
        ) {
            expand.click();
            openedByStrata =
                true;

            const hydrateStarted =
                Date.now();

            while (
                Date.now() -
                    hydrateStarted <
                    1800
            ) {
                await wait(
                    100
                );

                const afterAnchors =
                    root.querySelectorAll(
                        'a[href]'
                    ).length;

                const collapse =
                    root.querySelector(
                        '#collapse'
                    );

                if (
                    afterAnchors >
                        beforeAnchors ||
                    elementIsVisible(
                        collapse
                    )
                ) {
                    break;
                }
            }
        }

        await new Promise(
            resolve =>
                requestAnimationFrame(
                    resolve
                )
        );

        return {
            root,
            openedByStrata
        };
    }

    function restoreDescriptionAfterLinkScan(
        state
    ) {
        if (
            !state?.openedByStrata ||
            !state.root?.isConnected
        ) {
            return;
        }

        const collapse =
            state.root.querySelector(
                '#collapse'
            );

        if (
            collapse &&
            elementIsVisible(
                collapse
            )
        ) {
            collapse.click();
        }
    }

    function scanVisibleDescription(
        candidates
    ) {
        for (
            const node
            of descriptionRoots()
        ) {
            for (
                const anchor
                of node.querySelectorAll(
                    'a[href]'
                )
            ) {
                /*
                    The expanded YouTube description currently appends an
                    uploader/channel card beneath the creator-written text.
                    Its own SoundCloud/Bandcamp links are not release links.
                    Ignore anchors that belong to that appended card so an
                    uploader such as PARADIGMAS cannot outrank the artist.
                */

                if (
                    descriptionAnchorIsAppendedChannelCard(
                        node,
                        anchor
                    )
                ) {
                    continue;
                }

                /*
                    YouTube's description UI has changed several times.
                    Depending on the renderer, the full destination can
                    live in href, the resolved DOM href, or a data field.
                    Try all harmless local representations and let the
                    normal URL classifier dedupe them.
                */

                const possibleUrls = [
                    anchor.href,
                    anchor.getAttribute(
                        'href'
                    ),
                    anchor.getAttribute(
                        'data-url'
                    ),
                    anchor.getAttribute(
                        'data-expanded-url'
                    ),
                    anchor.getAttribute(
                        'title'
                    )
                ];

                for (
                    const possibleUrl
                    of possibleUrls
                ) {
                    if (
                        possibleUrl
                    ) {
                        addMusicLink(
                            candidates,
                            possibleUrl,
                            'Description'
                        );
                    }
                }
            }

            extractLinksFromText(
                node.innerText ||
                    node.textContent,
                candidates,
                'Description'
            );
        }
    }

    function scanLoadedComments(
        candidates
    ) {
        const comments =
            document.querySelectorAll(
                'ytd-comment-thread-renderer, ytd-comment-view-model'
            );

        for (
            const comment
            of comments
        ) {
            for (
                const anchor
                of comment.querySelectorAll(
                    'a[href]'
                )
            ) {
                addMusicLink(
                    candidates,
                    anchor.href,
                    'Comment'
                );
            }

            extractLinksFromText(
                comment.textContent,
                candidates,
                'Comment'
            );
        }
    }

    // ============================================================
    // BANDCAMP VALIDATION
    // ============================================================

    /*
        v8.5.91 network guard. Every page STRATA fetches goes through here
        (Bandcamp release validation, SoundCloud profiles/search). Only
        these hosts are ever requested — never YouTube or Google — and at
        most three requests run at once, so a description full of links
        cannot turn into a burst.
    */

    const EXTERNAL_REQUEST_HOST_PATTERNS = [
        /^([a-z0-9-]+\.)*bandcamp\.com$/i,
        /^(www\.)?soundcloud\.com$/i
    ];

    const EXTERNAL_REQUEST_MAX_CONCURRENT =
        3;

    let externalRequestsActive =
        0;

    const externalRequestQueue =
        [];

    function externalRequestAllowed(
        url
    ) {
        try {
            const parsed =
                new URL(
                    url
                );

            if (
                parsed.protocol !==
                    'https:' &&
                parsed.protocol !==
                    'http:'
            ) {
                return false;
            }

            return EXTERNAL_REQUEST_HOST_PATTERNS.some(
                pattern =>
                    pattern.test(
                        parsed.hostname
                    )
            );

        } catch {
            return false;
        }
    }

    function pumpExternalRequestQueue() {
        while (
            externalRequestsActive <
                EXTERNAL_REQUEST_MAX_CONCURRENT &&
            externalRequestQueue.length
        ) {
            const job =
                externalRequestQueue.shift();

            externalRequestsActive++;

            runExternalPageRequest(
                job.url
            )
                .then(
                    job.resolve,
                    job.reject
                )
                .finally(
                    () => {
                        externalRequestsActive--;

                        pumpExternalRequestQueue();
                    }
                );
        }
    }

    function requestExternalPage(
        url
    ) {
        if (
            !externalRequestAllowed(
                url
            )
        ) {
            console.warn(
                '[STRATA] blocked request to a non-allowlisted host',
                url
            );

            return Promise.reject(
                new Error(
                    'Host not allowed'
                )
            );
        }

        return new Promise(
            (
                resolve,
                reject
            ) => {
                externalRequestQueue.push({
                    url,
                    resolve,
                    reject
                });

                pumpExternalRequestQueue();
            }
        );
    }

    function runExternalPageRequest(
        url
    ) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                GM_xmlhttpRequest({
                    method:
                        'GET',

                    url,

                    timeout:
                        12000,

                    onload:
                        response => {
                            if (
                                response.status >=
                                    200 &&
                                response.status <
                                    400
                            ) {
                                resolve({
                                    html:
                                        response.responseText ||
                                        '',

                                    finalUrl:
                                        response.finalUrl ||
                                        url
                                });

                            } else {
                                reject(
                                    new Error(
                                        `HTTP ${response.status}`
                                    )
                                );
                            }
                        },

                    onerror:
                        () =>
                            reject(
                                new Error(
                                    'Request failed'
                                )
                            ),

                    ontimeout:
                        () =>
                            reject(
                                new Error(
                                    'Request timed out'
                                )
                            )
                });
            }
        );
    }

    function bandcampLooksDead(
        html
    ) {
        const lower =
            String(
                html ||
                ''
            ).toLowerCase();

        return (
            !lower ||
            lower.includes(
                "sorry, that something isn't here"
            ) ||
            lower.includes(
                'sorry, that something isn’t here'
            ) ||
            lower.includes(
                'page not found'
            )
        );
    }

    function parseBandcampAvailability(
        html
    ) {
        /*
            IMPORTANT:

            Only inspect Bandcamp's purchase area for the CURRENT
            release. The old detector searched the entire page for
            the word "vinyl", which could be triggered by unrelated
            merch, discography entries or other page text.
        */

        const raw =
            String(
                html ||
                ''
            );

        let documentRoot =
            null;

        try {
            documentRoot =
                strataParseHTML(
                        raw
                    );

        } catch {}

        const normalize =
            value =>
                String(
                    value ||
                    ''
                )
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim()
                    .toLowerCase();

        let purchaseItems =
            [];

        let purchaseText =
            '';

        if (documentRoot) {
            const purchaseRoot =
                documentRoot.querySelector(
                    '#trackInfoInner'
                ) ||
                documentRoot.querySelector(
                    '#trackInfo'
                );

            if (purchaseRoot) {
                purchaseItems =
                    [
                        ...purchaseRoot
                            .querySelectorAll(
                                '.buyItem'
                            )
                    ];

                purchaseText =
                    normalize(
                        purchaseRoot.textContent
                    );
            }
        }

        /*
            If Bandcamp changes its markup, fall back to strong
            purchase phrases only. We deliberately NEVER use a bare
            page-wide "vinyl" match again.
        */

        if (!purchaseText) {
            purchaseText =
                normalize(
                    raw
                );
        }

        const itemText =
            item =>
                normalize(
                    item?.textContent
                );

        const digital =
            purchaseItems.length
                ? purchaseItems.some(
                    item => {
                        const text =
                            itemText(
                                item
                            );

                        return (
                            item.classList
                                ?.contains(
                                    'digital'
                                ) ||
                            /\bdigital (album|track)\b/i
                                .test(
                                    text
                                ) ||
                            /\bbuy digital (album|track)\b/i
                                .test(
                                    text
                                )
                        );
                    }
                )
                : (
                    /\bdigital (album|track)\b/i
                        .test(
                            purchaseText
                        ) ||
                    /\bbuy digital (album|track)\b/i
                        .test(
                            purchaseText
                        )
                );

        const vinylItems =
            purchaseItems.filter(
                item => {
                    const text =
                        itemText(
                            item
                        );

                    return (
                        /\brecord\s*\/\s*vinyl\b/i
                            .test(
                                text
                            ) ||
                        /\bbuy vinyl\b/i
                            .test(
                                text
                            )
                    );
                }
            );

        let vinyl =
            false;

        let vinylSoldOut =
            false;

        let vinylAvailable =
            false;

        if (vinylItems.length) {
            vinyl =
                true;

            const states =
                vinylItems.map(
                    item => {
                        const text =
                            itemText(
                                item
                            );

                        const soldOut =
                            /\bsold[ -]?out\b/i
                                .test(
                                    text
                                );

                        const buyable =
                            /\bbuy vinyl\b/i
                                .test(
                                    text
                                ) &&
                            !soldOut;

                        return {
                            soldOut,
                            buyable
                        };
                    }
                );

            vinylAvailable =
                states.some(
                    state =>
                        state.buyable
                );

            vinylSoldOut =
                !vinylAvailable &&
                states.some(
                    state =>
                        state.soldOut
                );

        } else {
            /*
                Conservative fallback for changed Bandcamp markup:
                only explicit purchase wording can declare vinyl.
            */

            const hasVinylPackage =
                /\brecord\s*\/\s*vinyl\b/i
                    .test(
                        purchaseText
                    );

            const hasBuyVinyl =
                /\bbuy vinyl\b/i
                    .test(
                        purchaseText
                    );

            const hasSoldOut =
                /\bsold[ -]?out\b/i
                    .test(
                        purchaseText
                    );

            vinyl =
                hasVinylPackage ||
                hasBuyVinyl;

            vinylAvailable =
                hasBuyVinyl &&
                !hasSoldOut;

            vinylSoldOut =
                vinyl &&
                !vinylAvailable &&
                hasSoldOut;
        }

        return {
            digital,
            vinyl,
            vinylAvailable,
            vinylSoldOut
        };
    }

    // ============================================================
    // RELEASE PROFILE INFO
    // ============================================================

    function normalizeProfileName(
        value
    ) {
        return String(
            value ||
            ''
        )
            .toLowerCase()
            .normalize(
                'NFKD'
            )
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .replace(
                /[^a-z0-9]+/g,
                ''
            );
    }

    function resolveProfileUrl(
        value,
        baseUrl
    ) {
        if (!value) {
            return null;
        }

        try {
            const url =
                new URL(
                    value,
                    baseUrl
                );

            if (
                !/^https?:$/i.test(
                    url.protocol
                )
            ) {
                return null;
            }

            url.hash =
                '';

            return url.toString();

        } catch {
            return null;
        }
    }

    function classifyProfileService(
        value
    ) {
        try {
            const url =
                new URL(
                    value
                );

            const host =
                url.hostname
                    .toLowerCase()
                    .replace(
                        /^www\./,
                        ''
                    );

            if (
                host ===
                    'bandcamp.com' ||
                host.endsWith(
                    '.bandcamp.com'
                )
            ) {
                return 'Bandcamp';
            }

            if (
                host ===
                    'soundcloud.com' ||
                host.endsWith(
                    '.soundcloud.com'
                )
            ) {
                return 'SoundCloud';
            }

            if (
                host ===
                    'instagram.com' ||
                host.endsWith(
                    '.instagram.com'
                )
            ) {
                return 'Instagram';
            }

            if (
                host ===
                    'ra.co' ||
                host.endsWith(
                    '.ra.co'
                )
            ) {
                return 'Resident Advisor';
            }

        } catch {}

        return null;
    }

    function profileLinksFromNode(
        node,
        baseUrl
    ) {
        const result =
            {};

        if (!node) {
            return result;
        }

        for (
            const anchor
            of node.querySelectorAll(
                'a[href]'
            )
        ) {
            const url =
                resolveProfileUrl(
                    anchor.getAttribute(
                        'href'
                    ),
                    baseUrl
                );

            const service =
                classifyProfileService(
                    url
                );

            if (
                service &&
                !result[
                    service
                ]
            ) {
                result[
                    service
                ] =
                    url;
            }
        }

        return result;
    }

    function parseBandcampReleaseInfo(
        html,
        finalUrl
    ) {
        /*
            v8.5.80: DOM parse first; if that is unavailable or yields
            nothing, fall back to a regex parse of the embedded Bandcamp
            data so Release Info never depends on DOMParser alone.
        */

        let info =
            null;

        try {
            info =
                parseBandcampReleaseInfoDom(
                    html,
                    finalUrl
                );

        } catch (
            error
        ) {
            console.debug(
                '[STRATA] Bandcamp DOM parse failed, using fallback',
                error
            );
        }

        if (info) {
            return info;
        }

        try {
            return parseBandcampReleaseInfoFallback(
                html,
                finalUrl
            );

        } catch {
            return null;
        }
    }

    function parseBandcampReleaseInfoFallback(
        html,
        finalUrl
    ) {
        const raw =
            String(
                html ||
                ''
            );

        const releaseUrl =
            resolveProfileUrl(
                finalUrl,
                finalUrl
            );

        if (
            !raw ||
            !releaseUrl
        ) {
            return null;
        }

        let releaseObject =
            null;

        try {
            releaseObject =
                new URL(
                    releaseUrl
                );

        } catch {
            return null;
        }

        const accountUrl =
            `${releaseObject.origin}/`;

        const clean =
            value =>
                strataDecodeEntities(
                    String(
                        value ||
                        ''
                    )
                        .replace(
                            /<[^>]*>/g,
                            ' '
                        )
                )
                    .replace(
                        /^\s*by\s+/i,
                        ''
                    )
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();

        const readJsonAttribute =
            attribute => {
                for (
                    const quote
                    of [
                        '"',
                        "'"
                    ]
                ) {
                    const match =
                        raw.match(
                            new RegExp(
                                `${attribute}=${quote}([\\s\\S]*?)${quote}`,
                                'i'
                            )
                        );

                    if (
                        match &&
                        match[1]
                    ) {
                        try {
                            return JSON.parse(
                                strataDecodeEntities(
                                    match[1]
                                )
                            );
                        } catch {}
                    }
                }

                return null;
            };

        const readMeta =
            name => {
                const match =
                    raw.match(
                        new RegExp(
                            `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`,
                            'i'
                        )
                    ) ||
                    raw.match(
                        new RegExp(
                            `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
                            'i'
                        )
                    );

                return match
                    ? clean(
                        match[1]
                    )
                    : '';
            };

        const tralbum =
            readJsonAttribute(
                'data-tralbum'
            );

        const bandData =
            readJsonAttribute(
                'data-band'
            );

        const isTrackPage =
            /^\/track\//i.test(
                releaseObject.pathname
            );

        const isAlbumPage =
            /^\/album\//i.test(
                releaseObject.pathname
            );

        const ogTitle =
            readMeta(
                'og:title'
            );

        const siteName =
            readMeta(
                'og:site_name'
            );

        let artistName =
            clean(
                tralbum?.artist ||
                tralbum?.current?.artist ||
                ''
            );

        if (!artistName) {
            const byMatch =
                ogTitle.match(
                    /,\s*by\s+(.+)$/i
                );

            if (byMatch) {
                artistName =
                    clean(
                        byMatch[1]
                    );
            }
        }

        artistName =
            cleanReleaseEntityName(
                artistName,
                'artist'
            ) ||
            null;

        const profileName =
            clean(
                bandData?.name ||
                siteName ||
                ''
            );

        const labelName =
            profileName &&
            normalizeProfileName(
                profileName
            ) !==
                normalizeProfileName(
                    artistName
                )
                ? (
                    cleanReleaseEntityName(
                        profileName,
                        'label'
                    ) ||
                    null
                )
                : null;

        const currentTitle =
            clean(
                tralbum?.current?.title ||
                ogTitle.replace(
                    /,\s*by\s+.+$/i,
                    ''
                )
            );

        const trackTitle =
            cleanReleaseTextValue(
                isTrackPage
                    ? currentTitle
                    : ''
            );

        const releaseTitle =
            cleanReleaseTextValue(
                clean(
                    tralbum?.album_title ||
                    ''
                ) ||
                (
                    isAlbumPage
                        ? currentTitle
                        : ''
                )
            );

        const released =
            cleanReleaseDateDisplay(
                tralbum?.current?.release_date ||
                tralbum?.album_release_date ||
                tralbum?.release_date ||
                ''
            );

        if (
            !artistName &&
            !labelName
        ) {
            return null;
        }

        const artist = {
            name:
                artistName,
            links:
                {}
        };

        const label = {
            name:
                labelName,
            links:
                {}
        };

        if (
            artistName &&
            profileName &&
            normalizeProfileName(
                artistName
            ) ===
                normalizeProfileName(
                    profileName
                )
        ) {
            artist.links.Bandcamp =
                accountUrl;
        }

        if (labelName) {
            label.links.Bandcamp =
                accountUrl;
        }

        const sidebarLinks =
            bandcampSidebarLinksFromRaw(
                raw,
                releaseUrl
            );

        if (labelName) {
            mergeMissingProfileLinks(
                label.links,
                sidebarLinks
            );

        } else if (
            artist.links.Bandcamp ===
                accountUrl
        ) {
            mergeMissingProfileLinks(
                artist.links,
                sidebarLinks
            );
        }

        return {
            artist,
            label,
            pageType:
                isTrackPage
                    ? 'track'
                    : isAlbumPage
                        ? 'album'
                        : '',
            trackTitle,
            releaseTitle,
            released,
            parsedBy:
                'fallback'
        };
    }

    function parseBandcampReleaseInfoDom(
        html,
        finalUrl
    ) {
        const raw =
            String(
                html ||
                ''
            );

        let documentRoot =
            null;

        try {
            documentRoot =
                strataParseHTML(
                        raw
                    );

        } catch {}

        if (!documentRoot) {
            return null;
        }

        const releaseUrl =
            resolveProfileUrl(
                finalUrl,
                finalUrl
            );

        if (!releaseUrl) {
            return null;
        }

        let releaseObject =
            null;

        try {
            releaseObject =
                new URL(
                    releaseUrl
                );

        } catch {
            return null;
        }

        const accountUrl =
            `${releaseObject.origin}/`;

        /*
            Bandcamp has several live page layouts.  Do not depend on
            one DOM selector.  We read the visible DOM first, then the
            embedded Bandcamp JSON, then standard page metadata, and
            finally a conservative account-name fallback.

            This still uses the SAME Bandcamp response STRATA already
            fetched for DIGITAL / VINYL detection.  No extra request.
        */

        function decodeHtmlText(
            value
        ) {
            const input =
                String(
                    value ||
                    ''
                );

            if (!input) {
                return '';
            }

            try {
                // Parsed into an inert document: nothing runs, every
                // entity (&eacute; etc.) is decoded to plain text.
                const parsed =
                    new DOMParser().parseFromString(
                        strataTrustedHTML(
                            input
                        ),
                        'text/html'
                    );

                return String(
                    parsed.body?.textContent ||
                    ''
                );

            } catch {
                return strataDecodeEntities(
                    input
                );
            }
        }

        function cleanName(
            value
        ) {
            return decodeHtmlText(
                String(
                    value ||
                    ''
                )
                    .replace(
                        /<[^>]*>/g,
                        ' '
                    )
            )
                .replace(
                    /^\s*by\s+/i,
                    ''
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();
        }

        function rawMatch(
            patterns
        ) {
            for (
                const pattern
                of patterns
            ) {
                const match =
                    raw.match(
                        pattern
                    );

                if (
                    match &&
                    match[1]
                ) {
                    const value =
                        cleanName(
                            match[1]
                        );

                    if (value) {
                        return value;
                    }
                }
            }

            return '';
        }

        function readEmbeddedJson(
            attribute
        ) {
            const candidates =
                [];

            const node =
                documentRoot.querySelector(
                    `[${attribute}]`
                );

            if (node) {
                candidates.push(
                    node.getAttribute(
                        attribute
                    )
                );
            }

            const doubleQuoted =
                raw.match(
                    new RegExp(
                        `${attribute}="([\\s\\S]*?)"`,
                        'i'
                    )
                );

            if (
                doubleQuoted &&
                doubleQuoted[1]
            ) {
                candidates.push(
                    doubleQuoted[1]
                );
            }

            const singleQuoted =
                raw.match(
                    new RegExp(
                        `${attribute}='([\\s\\S]*?)'`,
                        'i'
                    )
                );

            if (
                singleQuoted &&
                singleQuoted[1]
            ) {
                candidates.push(
                    singleQuoted[1]
                );
            }

            for (
                const candidate
                of candidates
            ) {
                if (!candidate) {
                    continue;
                }

                const decoded =
                    decodeHtmlText(
                        candidate
                    );

                try {
                    return JSON.parse(
                        decoded
                    );

                } catch {}
            }

            return null;
        }

        const tralbum =
            readEmbeddedJson(
                'data-tralbum'
            );

        const bandData =
            readEmbeddedJson(
                'data-band'
            );

        let jsonLd =
            null;

        for (
            const script
            of documentRoot.querySelectorAll(
                'script[type="application/ld+json"]'
            )
        ) {
            try {
                const parsed =
                    JSON.parse(
                        script.textContent ||
                        'null'
                    );

                const candidates =
                    Array.isArray(
                        parsed
                    )
                        ? parsed
                        : [parsed];

                const useful =
                    candidates.find(
                        item =>
                            item &&
                            typeof item ===
                                'object' &&
                            (
                                item.byArtist ||
                                item.author ||
                                item.name
                            )
                    );

                if (useful) {
                    jsonLd =
                        useful;
                    break;
                }

            } catch {}
        }

        const titleFromDom =
            cleanName(
                documentRoot.title ||
                ''
            );

        const titleFromMeta =
            cleanName(
                documentRoot.querySelector(
                    'meta[property="og:title"], meta[name="title"]'
                )?.getAttribute(
                    'content'
                ) ||
                ''
            );

        const titleFromRaw =
            rawMatch([
                /<title[^>]*>([\s\S]*?)<\/title>/i,
                /<meta[^>]+(?:property|name)=["'](?:og:title|title)["'][^>]+content=["']([^"']+)["']/i,
                /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|title)["']/i
            ]);

        const pageTitle =
            titleFromDom ||
            titleFromMeta ||
            titleFromRaw;

        const titleParts =
            String(
                pageTitle ||
                ''
            )
                .split('|')
                .map(
                    value =>
                        cleanName(
                            value
                        )
                )
                .filter(
                    Boolean
                );

        const isTrackPage =
            /^\/track\//i.test(
                releaseObject.pathname
            );

        const isAlbumPage =
            /^\/album\//i.test(
                releaseObject.pathname
            );

        const primaryTitle =
            cleanName(
                documentRoot.querySelector(
                    '#name-section .trackTitle, ' +
                    '#name-section h2.trackTitle, ' +
                    'h2.trackTitle'
                )?.textContent ||
                ''
            );

        const albumAnchor =
            documentRoot.querySelector(
                '#name-section h3 a[href*="/album/"], ' +
                'a[href*="/album/"][itemprop="inAlbum"]'
            );

        const bandcampTrackTitle =
            cleanReleaseTextValue(
                isTrackPage
                    ? (
                        primaryTitle ||
                        tralbum
                            ?.current
                            ?.title ||
                        jsonLd
                            ?.name ||
                        titleParts[
                            0
                        ] ||
                        ''
                    )
                    : ''
            );

        const bandcampReleaseTitle =
            cleanReleaseTextValue(
                (
                    cleanName(
                        albumAnchor
                            ?.textContent ||
                        ''
                    ) ||
                    tralbum
                        ?.album_title ||
                    jsonLd
                        ?.inAlbum
                        ?.name ||
                    (
                        isAlbumPage
                            ? (
                                primaryTitle ||
                                tralbum
                                    ?.current
                                    ?.title ||
                                jsonLd
                                    ?.name ||
                                titleParts[
                                    0
                                ] ||
                                ''
                            )
                            : ''
                    )
                )
            );

        const creditsText =
            cleanName(
                documentRoot.querySelector(
                    '#trackInfoInner .tralbumData.tralbum-credits, ' +
                    '.tralbumData.tralbum-credits'
                )?.textContent ||
                ''
            );

        const creditsReleaseMatch =
            creditsText.match(
                /\breleased\s+([^.;\n]+)/i
            );

        const bandcampReleased =
            cleanReleaseDateDisplay(
                jsonLd
                    ?.datePublished ||
                tralbum
                    ?.current
                    ?.release_date ||
                tralbum
                    ?.album_release_date ||
                tralbum
                    ?.release_date ||
                creditsReleaseMatch
                    ?.[
                        1
                    ] ||
                ''
            );

        /*
            Find the artist link.  On many Bandcamp track pages the
            first <h3> link is the parent album, while the LAST link is
            the artist.  Prefer explicit artist selectors, then use the
            last byline link rather than blindly taking the first one.
        */

        let artistAnchor =
            documentRoot.querySelector(
                '#name-section [itemprop="byArtist"] a[href], ' +
                '#name-section .tralbum-artist a[href], ' +
                '.tralbum-artist a[href], ' +
                '[itemprop="byArtist"] a[href]'
            );

        const artistHeading =
            documentRoot.querySelector(
                '#name-section h3, .tralbumData.tralbum-artist, [itemprop="byArtist"]'
            );

        if (!artistAnchor) {
            const headingAnchors =
                [
                    ...documentRoot.querySelectorAll(
                        '#name-section h3 a[href]'
                    )
                ];

            if (
                headingAnchors.length
            ) {
                artistAnchor =
                    headingAnchors[
                        headingAnchors.length -
                        1
                    ];
            }
        }

        const structuredArtist =
            tralbum?.artist ||
            tralbum?.current?.artist ||
            tralbum?.trackinfo
                ?.find(
                    track =>
                        track?.artist
                )
                ?.artist ||
            jsonLd?.byArtist?.name ||
            jsonLd?.author?.name ||
            rawMatch([
                /["']artist["']\s*:\s*["']([^"']+)["']/i,
                /["']artist_name["']\s*:\s*["']([^"']+)["']/i
            ]) ||
            null;

        let artistName =
            cleanName(
                artistAnchor?.textContent ||
                structuredArtist ||
                ''
            );

        /*
            Bandcamp titles commonly use:
            Track | Artist | Label
            Album | Artist
        */

        if (
            !artistName &&
            titleParts.length >=
                2
        ) {
            artistName =
                titleParts[1];
        }

        if (
            !artistName &&
            artistHeading
        ) {
            const headingText =
                cleanName(
                    artistHeading.textContent ||
                    ''
                );

            const byMatch =
                headingText.match(
                    /(?:^|\s)by\s+(.+)$/i
                );

            if (
                byMatch &&
                byMatch[1]
            ) {
                artistName =
                    cleanName(
                        byMatch[1]
                    );
            }
        }

        artistName =
            cleanReleaseEntityName(
                artistName,
                'artist'
            ) ||
            null;

        if (
            !artistName ||
            normalizeProfileName(
                artistName
            ) ===
                'by'
        ) {
            artistName =
                null;
        }

        let profileName =
            cleanName(
                /*
                    v8.5.81: query the .title child first. A combined selector
                    list returns the first match in document order, which was
                    the #band-name-location container itself, so the label
                    picked up its location ("Six Of Swords Bristol, UK").
                */
                (
                    () => {
                        const titleNode =
                            documentRoot.querySelector(
                                '#band-name-location .title'
                            ) ||
                            documentRoot.querySelector(
                                '.band-name-location .title'
                            );

                        if (titleNode) {
                            return titleNode.textContent;
                        }

                        const box =
                            documentRoot.querySelector(
                                '#band-name-location'
                            );

                        if (!box) {
                            return '';
                        }

                        const clone =
                            box.cloneNode(
                                true
                            );

                        clone
                            .querySelectorAll(
                                '.location'
                            )
                            .forEach(
                                node =>
                                    node.remove()
                            );

                        return clone.textContent;
                    }
                )() ||
                bandData?.name ||
                bandData?.band_name ||
                rawMatch([
                    /["']band_name["']\s*:\s*["']([^"']+)["']/i,
                    /id=["']band-name-location["'][\s\S]{0,500}?class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\//i
                ]) ||
                ''
            );

        if (
            !profileName &&
            titleParts.length >=
                3
        ) {
            profileName =
                titleParts[
                    titleParts.length -
                    1
                ];
        }

        /*
            Last-resort Bandcamp account name.  This is not a search or
            invented URL: it is simply the account that owns the exact
            Bandcamp release page STRATA already verified.
        */

        if (!profileName) {
            const hostLabel =
                releaseObject.hostname
                    .toLowerCase()
                    .replace(
                        /\.bandcamp\.com$/,
                        ''
                    )
                    .replace(
                        /^www\./,
                        ''
                    )
                    .replace(
                        /[-_.]+/g,
                        ' '
                    )
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();

            if (
                hostLabel &&
                hostLabel !==
                    'bandcamp'
            ) {
                profileName =
                    hostLabel
                        .replace(
                            /\b\w/g,
                            letter =>
                                letter.toUpperCase()
                        );
            }
        }

        if (
            normalizeProfileName(
                profileName
            ) ===
            'bandcamp'
        ) {
            profileName =
                '';
        }

        let labelName =
            null;

        if (
            profileName &&
            normalizeProfileName(
                profileName
            ) !==
            normalizeProfileName(
                artistName
            )
        ) {
            labelName =
                profileName;
        }

        labelName =
            cleanReleaseEntityName(
                labelName,
                'label'
            ) ||
            null;

        const artist = {
            name:
                artistName,
            links:
                {}
        };

        const label = {
            name:
                labelName,
            links:
                {}
        };

        let artistAnchorUrl =
            resolveProfileUrl(
                artistAnchor?.getAttribute(
                    'href'
                ),
                releaseUrl
            );

        /*
            If the byline selector missed the artist URL, match a
            Bandcamp anchor by the artist's visible name anywhere on
            the release page.
        */

        if (
            !artistAnchorUrl &&
            artistName
        ) {
            const artistKey =
                normalizeProfileName(
                    artistName
                );

            for (
                const anchor
                of documentRoot.querySelectorAll(
                    'a[href]'
                )
            ) {
                if (
                    normalizeProfileName(
                        anchor.textContent ||
                        ''
                    ) !==
                    artistKey
                ) {
                    continue;
                }

                const candidateUrl =
                    resolveProfileUrl(
                        anchor.getAttribute(
                            'href'
                        ),
                        releaseUrl
                    );

                if (
                    classifyProfileService(
                        candidateUrl
                    ) ===
                    'Bandcamp'
                ) {
                    artistAnchorUrl =
                        candidateUrl;
                    break;
                }
            }
        }

        if (
            artistName &&
            profileName &&
            normalizeProfileName(
                artistName
            ) ===
            normalizeProfileName(
                profileName
            )
        ) {
            artist.links.Bandcamp =
                accountUrl;

        } else if (
            artistAnchorUrl
        ) {
            try {
                const artistUrl =
                    new URL(
                        artistAnchorUrl
                    );

                const isReleasePath =
                    artistUrl.origin ===
                        releaseObject.origin &&
                    /^\/(album|track)\//i
                        .test(
                            artistUrl.pathname
                        );

                if (!isReleasePath) {
                    artist.links.Bandcamp =
                        artistAnchorUrl;
                }

            } catch {}
        }

        if (
            labelName
        ) {
            label.links.Bandcamp =
                accountUrl;
        }

        const artistAbout =
            documentRoot.querySelector(
                '#trackInfoInner .tralbumData.tralbum-about, ' +
                '.tralbumData.tralbum-about, ' +
                '#trackInfoInner .tralbum-about'
            );

        Object.assign(
            artist.links,
            profileLinksFromNode(
                artistAbout,
                releaseUrl
            )
        );

        const labelLinksRoot =
            documentRoot.querySelector(
                '#band-links'
            ) ||
            documentRoot.querySelector(
                '.band-links'
            ) ||
            documentRoot.querySelector(
                '#bio-container'
            ) ||
            documentRoot.querySelector(
                '#band-info'
            );

        if (
            labelName
        ) {
            Object.assign(
                label.links,
                profileLinksFromNode(
                    labelLinksRoot,
                    releaseUrl
                )
            );

        } else if (
            artist.links.Bandcamp ===
                accountUrl
        ) {
            /*
                v8.5.82: self-released page. The sidebar links belong to
                the artist, so they are no longer thrown away.
            */

            mergeMissingProfileLinks(
                artist.links,
                profileLinksFromNode(
                    labelLinksRoot,
                    releaseUrl
                )
            );
        }

        if (
            !artist.name &&
            !label.name
        ) {
            return null;
        }

        return {
            artist,
            label,
            pageType:
                isTrackPage
                    ? 'track'
                    : isAlbumPage
                        ? 'album'
                        : '',
            trackTitle:
                bandcampTrackTitle,
            releaseTitle:
                bandcampReleaseTitle,
            released:
                bandcampReleased
        };
    }

    function collectVisibleProfileLinks() {
        const results =
            [];

        const seen =
            new Set();

        const selectors = [
            '#description',
            '#description-inline-expander',
            '#description-inner'
        ];

        for (
            const selector
            of selectors
        ) {
            const root =
                document.querySelector(
                    selector
                );

            if (!root) {
                continue;
            }

            for (
                const anchor
                of root.querySelectorAll(
                    'a[href]'
                )
            ) {
                if (
                    descriptionAnchorIsAppendedChannelCard(
                        root,
                        anchor
                    )
                ) {
                    continue;
                }

                const raw =
                    unwrapYouTubeRedirect(
                        anchor.href
                    );

                const url =
                    resolveProfileUrl(
                        raw,
                        location.href
                    );

                const service =
                    classifyProfileService(
                        url
                    );

                if (
                    !url ||
                    !service ||
                    service ===
                        'Bandcamp' ||
                    seen.has(
                        url
                    )
                ) {
                    continue;
                }

                seen.add(
                    url
                );

                const before =
                    descriptionContextBeforeAnchor(
                        root,
                        anchor
                    );

                const beforeLower =
                    before.text
                        .toLowerCase();

                const artistSection =
                    beforeLower.lastIndexOf(
                        'follow artist'
                    );

                const labelSection =
                    beforeLower.lastIndexOf(
                        'follow label'
                    );

                const roleHint =
                    artistSection >
                        labelSection
                        ? 'artist'
                        : labelSection >
                            artistSection
                            ? 'label'
                            : null;

                results.push({
                    service,
                    url,
                    roleHint,
                    context:
                        String(
                            anchor.parentElement
                                ?.textContent ||
                            anchor.textContent ||
                            ''
                        )
                });
            }
        }

        return results;
    }

    function profileUrlSlug(
        value
    ) {
        try {
            const url =
                new URL(
                    value
                );

            return normalizeProfileName(
                url.pathname
                    .split('/')
                    .filter(
                        Boolean
                    )
                    .pop() ||
                ''
            );

        } catch {
            return '';
        }
    }

    function roleForResidentAdvisorUrl(
        value
    ) {
        try {
            const path =
                new URL(
                    value
                ).pathname
                    .toLowerCase();

            if (
                /^\/(dj|artists?)\//
                    .test(
                        path
                    )
            ) {
                return 'artist';
            }

            if (
                /^\/(labels?|record-labels?)\//
                    .test(
                        path
                    )
            ) {
                return 'label';
            }

        } catch {}

        return null;
    }

    function enrichReleaseInfoWithVisibleProfiles(
        releaseInfo
    ) {
        if (!releaseInfo) {
            return releaseInfo;
        }

        const artistName =
            releaseInfo.artist?.name ||
            '';

        const labelName =
            releaseInfo.label?.name ||
            '';

        const artistKey =
            normalizeProfileName(
                artistName
            );

        const labelKey =
            normalizeProfileName(
                labelName
            );

        for (
            const candidate
            of collectVisibleProfileLinks()
        ) {
            const slug =
                profileUrlSlug(
                    candidate.url
                );

            const contextKey =
                normalizeProfileName(
                    candidate.context
                );

            let role =
                candidate.roleHint ||
                (
                    candidate.service ===
                        'Resident Advisor'
                        ? roleForResidentAdvisorUrl(
                            candidate.url
                        )
                        : null
                );

            if (
                !role &&
                artistKey &&
                (
                    contextKey.includes(
                        artistKey
                    ) ||
                    (
                        slug.length >=
                            4 &&
                        (
                            artistKey.includes(
                                slug
                            ) ||
                            slug.includes(
                                artistKey
                            )
                        )
                    )
                )
            ) {
                role =
                    'artist';
            }

            if (
                !role &&
                labelKey &&
                (
                    contextKey.includes(
                        labelKey
                    ) ||
                    (
                        slug.length >=
                            4 &&
                        (
                            labelKey.includes(
                                slug
                            ) ||
                            slug.includes(
                                labelKey
                            )
                        )
                    )
                )
            ) {
                role =
                    'label';
            }

            if (
                role ===
                    'artist' &&
                releaseInfo.artist &&
                !releaseInfo.artist
                    .links[
                        candidate.service
                    ]
            ) {
                releaseInfo.artist
                    .links[
                        candidate.service
                    ] =
                    candidate.url;
            }

            if (
                role ===
                    'label' &&
                releaseInfo.label &&
                !releaseInfo.label
                    .links[
                        candidate.service
                    ]
            ) {
                releaseInfo.label
                    .links[
                        candidate.service
                    ] =
                    candidate.url;
            }
        }

        return releaseInfo;
    }

    function getCurrentReleaseInfo() {
        const bandcamp =
            currentLinks.find(
                link =>
                    link.service ===
                        'Bandcamp'
            );

        const bandcampInfo =
            bandcamp
                ?.bandcamp
                ?.releaseInfo ||
            null;

        const metadata =
            descriptionMetadata();

        const youtubeTrackTitle =
            cleanReleaseTextValue(
                trackNameFromYouTubeTitle()
            );

        const bandcampTrackTitle =
            cleanReleaseTextValue(
                bandcampInfo
                    ?.trackTitle ||
                ''
            );

        const descriptionTitle =
            cleanReleaseTextValue(
                metadata.title ||
                ''
            );

        const artistName =
            cleanReleaseEntityName(
                bandcampInfo
                    ?.artist
                    ?.name ||
                metadata.artistName ||
                artistNameFromYouTubeTitle(),
                'artist'
            );

        const labelName =
            cleanReleaseEntityName(
                bandcampInfo
                    ?.label
                    ?.name ||
                metadata.label,
                'label'
            );

        /*
            Only a validated Bandcamp /track/ page outranks the actual
            YouTube video title for track identity. An /album/ page describes
            the parent release, not necessarily the specific video track.
        */

        let trackTitle =
            (
                bandcampInfo
                    ?.pageType ===
                    'track' &&
                bandcampTrackTitle
            )
                ? bandcampTrackTitle
                : (
                    youtubeTrackTitle ||
                    bandcampTrackTitle ||
                    descriptionTitle
                );

        let releaseTitle =
            cleanReleaseTextValue(
                bandcampInfo
                    ?.releaseTitle ||
                metadata.releaseTitle ||
                ''
            );

        /*
            Many label uploads use "Title:" for the EP/LP title while the
            actual YouTube video heading is Artist - Track. If those values
            are different, preserve the video heading as TRACK and promote
            the description title to EP/LP instead of overwriting the track.
        */

        if (
            !releaseTitle &&
            descriptionTitle &&
            trackTitle &&
            !sameReleaseTitle(
                descriptionTitle,
                trackTitle
            )
        ) {
            releaseTitle =
                descriptionTitle;
        }

        /*
            Never render the same title twice as TRACK and EP/LP.
        */

        if (
            releaseTitle &&
            trackTitle &&
            sameReleaseTitle(
                releaseTitle,
                trackTitle
            )
        ) {
            releaseTitle =
                '';
        }

        const released =
            cleanReleaseDateDisplay(
                bandcampInfo
                    ?.released ||
                metadata.released
            );

        if (
            !artistName &&
            !trackTitle &&
            !labelName &&
            !releaseTitle &&
            !released
        ) {
            return null;
        }

        return {
            artist: {
                name:
                    artistName,
                links: {
                    ...(
                        bandcampInfo
                            ?.artist
                            ?.links ||
                        {}
                    )
                }
            },

            label: {
                name:
                    labelName,
                links: {
                    ...(
                        bandcampInfo
                            ?.label
                            ?.links ||
                        {}
                    )
                }
            },

            trackTitle,
            releaseTitle,
            released,

            description: {
                title:
                    metadata.title ||
                    '',
                releaseTitle:
                    metadata.releaseTitle ||
                    '',
                catalogue:
                    metadata.catalogue ||
                    '',
                format:
                    metadata.format ||
                    '',
                country:
                    metadata.country ||
                    '',
                released:
                    metadata.released ||
                    ''
            }
        };
    }

    function buildServiceIconNode(
        service
    ) {
        const ns =
            'http://www.w3.org/2000/svg';

        const svg =
            document.createElementNS(
                ns,
                'svg'
            );

        svg.setAttribute(
            'viewBox',
            '0 0 24 24'
        );

        svg.setAttribute(
            'aria-hidden',
            'true'
        );

        const add =
            (
                tag,
                attributes,
                text
            ) => {
                const node =
                    document.createElementNS(
                        ns,
                        tag
                    );

                for (
                    const [
                        key,
                        value
                    ]
                    of Object.entries(
                        attributes
                    )
                ) {
                    node.setAttribute(
                        key,
                        value
                    );
                }

                if (
                    text !==
                    undefined
                ) {
                    node.textContent =
                        text;
                }

                svg.appendChild(
                    node
                );
            };

        if (
            service ===
            'Bandcamp'
        ) {
            add('path', {
                d: 'M7.1 5.2h14.2l-4.7 13.6H2.4L7.1 5.2Z',
                fill: 'currentColor'
            });

        } else if (
            service ===
            'SoundCloud'
        ) {
            add('path', {
                d: 'M3 11.2v4.6M5.1 9.6v7.8M7.2 8.2v10.6M9.3 7.2v11.8',
                stroke: 'currentColor',
                'stroke-width': '1.8',
                'stroke-linecap': 'round'
            });

            add('path', {
                d: 'M11.2 18.7h7.2a3.3 3.3 0 0 0 .4-6.6 5.2 5.2 0 0 0-9.7-1.9v7.1c.4.9 1.1 1.4 2.1 1.4Z',
                fill: 'currentColor'
            });

        } else if (
            service ===
            'Instagram'
        ) {
            add('rect', {
                x: '4.1',
                y: '4.1',
                width: '15.8',
                height: '15.8',
                rx: '4.4',
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '1.9'
            });

            add('circle', {
                cx: '12',
                cy: '12',
                r: '3.7',
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '1.9'
            });

            add('circle', {
                cx: '17.2',
                cy: '6.9',
                r: '1.1',
                fill: 'currentColor'
            });

        } else if (
            service ===
            'Resident Advisor'
        ) {
            add(
                'text',
                {
                    x: '12',
                    y: '15.8',
                    'text-anchor': 'middle',
                    fill: 'currentColor',
                    'font-size': '10.2',
                    'font-family': 'Arial, sans-serif',
                    'font-weight': '900',
                    'letter-spacing': '-.6'
                },
                'RA'
            );

        } else {
            return null;
        }

        return svg;
    }

    function createProfileIcon(
        service,
        url,
        ownerName
    ) {
        const anchor =
            document.createElement(
                'a'
            );

        anchor.className =
            'strata-profile-icon';

        anchor.href =
            url;

        anchor.target =
            '_blank';

        anchor.rel =
            'noopener noreferrer';

        anchor.title =
            `${ownerName} on ${service}`;

        anchor.setAttribute(
            'aria-label',
            anchor.title
        );

        const icon =
            buildServiceIconNode(
                service
            );

        if (icon) {
            anchor.appendChild(
                icon
            );
        }

        anchor.addEventListener(
            'click',
            event =>
                event.stopPropagation()
        );

        return anchor;
    }

    // ============================================================
    // v8.5.82 — ARTIST SOCIAL LINKS
    //
    // Bandcamp sidebar links are credited to the artist when the artist
    // owns the Bandcamp page. When STRATA has resolved an artist's
    // SoundCloud profile, that profile page is fetched ONCE per artist
    // (cached persistently) and any Instagram / RA / Bandcamp links in
    // its embedded data or bio are added to the artist.
    // ============================================================

    const SOUNDCLOUD_PROFILE_LINKS_KEY =
        'strata_v882_soundcloud_profile_links';

    // Profiles with no links found are re-checked after a week.
    const SOUNDCLOUD_PROFILE_LINKS_RETRY_MS =
        7 * 24 * 60 * 60 * 1000;

    let soundCloudProfileLinks =
        (
            () => {
                const stored =
                    GM_getValue(
                        SOUNDCLOUD_PROFILE_LINKS_KEY,
                        {}
                    );

                return stored &&
                    typeof stored ===
                        'object' &&
                    !Array.isArray(
                        stored
                    )
                    ? stored
                    : {};
            }
        )();

    const soundCloudProfileLinksInFlight =
        new Map();

    function mergeMissingProfileLinks(
        target,
        source
    ) {
        if (
            !target ||
            !source
        ) {
            return;
        }

        for (
            const [
                service,
                url
            ]
            of Object.entries(
                source
            )
        ) {
            if (
                url &&
                !target[
                    service
                ]
            ) {
                target[
                    service
                ] =
                    url;
            }
        }
    }

    function bandcampSidebarLinksFromRaw(
        raw,
        baseUrl
    ) {
        const links =
            {};

        const source =
            String(
                raw ||
                ''
            );

        const start =
            source.search(
                /id=["']band-links["']/i
            );

        if (
            start <
                0
        ) {
            return links;
        }

        let block =
            source.slice(
                start,
                start +
                    6000
            );

        const end =
            block.search(
                /<\/(?:ol|ul)>/i
            );

        if (
            end >
                0
        ) {
            block =
                block.slice(
                    0,
                    end
                );
        }

        for (
            const match
            of block.matchAll(
                /href=["']([^"']+)["']/gi
            )
        ) {
            const url =
                resolveProfileUrl(
                    strataDecodeEntities(
                        match[1]
                    ),
                    baseUrl
                );

            const service =
                classifyProfileService(
                    url
                );

            if (
                service &&
                !links[
                    service
                ]
            ) {
                links[
                    service
                ] =
                    url;
            }
        }

        return links;
    }

    function soundCloudProfileKey(
        url
    ) {
        const profile =
            soundCloudProfileFromTrackUrl(
                url
            );

        return profile
            ? String(
                profile.slug
            ).toLowerCase()
            : '';
    }

    function acceptableArtistSocialLink(
        service,
        url
    ) {
        try {
            const parsed =
                new URL(
                    url
                );

            const parts =
                parsed.pathname
                    .split(
                        '/'
                    )
                    .filter(
                        Boolean
                    )
                    .map(
                        part =>
                            part.toLowerCase()
                    );

            if (
                service ===
                    'Instagram'
            ) {
                // A real handle, and never SoundCloud's own account.
                return (
                    parts.length >=
                        1 &&
                    ![
                        'soundcloud',
                        'p',
                        'reel',
                        'reels',
                        'explore',
                        'accounts',
                        'stories'
                    ].includes(
                        parts[0]
                    )
                );
            }

            if (
                service ===
                    'Resident Advisor'
            ) {
                return (
                    roleForResidentAdvisorUrl(
                        url
                    ) ===
                        'artist'
                );
            }

            if (
                service ===
                    'Bandcamp'
            ) {
                return (
                    parsed.hostname
                        .toLowerCase()
                        .replace(
                            /^www\./,
                            ''
                        ) !==
                        'bandcamp.com'
                );
            }

            return false;

        } catch {
            return false;
        }
    }

    function extractSoundCloudProfileLinks(
        html,
        profileUrl
    ) {
        const links =
            {};

        const sources =
            new Set();

        const slug =
            soundCloudProfileKey(
                profileUrl
            );

        const add =
            (
                rawUrl,
                source
            ) => {
                const cleaned =
                    cleanLinkText(
                        rawUrl
                    ) ||
                    (
                        /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(
                            String(
                                rawUrl ||
                                ''
                            )
                        )
                            ? `https://${rawUrl}`
                            : null
                    );

                const url =
                    resolveProfileUrl(
                        cleaned,
                        profileUrl
                    );

                const service =
                    classifyProfileService(
                        url
                    );

                if (
                    !service ||
                    service ===
                        'SoundCloud' ||
                    links[
                        service
                    ] ||
                    !acceptableArtistSocialLink(
                        service,
                        url
                    )
                ) {
                    return;
                }

                links[
                    service
                ] =
                    url;

                sources.add(
                    source
                );
            };

        const readBio =
            text => {
                const bio =
                    String(
                        text ||
                        ''
                    );

                for (
                    const match
                    of bio.matchAll(
                        /(?:https?:\/\/|www\.)[^\s<>"']+/gi
                    )
                ) {
                    add(
                        match[0],
                        'bio'
                    );
                }

                for (
                    const match
                    of bio.matchAll(
                        /\b(?:instagram\.com|ra\.co)\/[A-Za-z0-9._\/-]+/gi
                    )
                ) {
                    add(
                        match[0],
                        'bio'
                    );
                }

                const handle =
                    bio.match(
                        /(?:instagram|insta|\bIG\b)\s*[:\-–]?\s*@([A-Za-z0-9._]{2,30})/i
                    );

                if (handle) {
                    add(
                        `https://www.instagram.com/${handle[1]}/`,
                        'bio-handle'
                    );
                }
            };

        const walk =
            (
                value,
                depth
            ) => {
                if (
                    !value ||
                    typeof value !==
                        'object' ||
                    depth >
                        14
                ) {
                    return;
                }

                if (
                    Array.isArray(
                        value
                    )
                ) {
                    for (
                        const item
                        of value
                    ) {
                        walk(
                            item,
                            depth +
                                1
                        );
                    }

                    return;
                }

                if (
                    value.kind ===
                        'user' &&
                    String(
                        value.permalink ||
                        ''
                    ).toLowerCase() ===
                        slug
                ) {
                    readBio(
                        value.description
                    );
                }

                // Web-profile records, if SoundCloud embeds them.
                if (
                    typeof value.url ===
                        'string' &&
                    (
                        value.network ||
                        value.service ||
                        value.kind ===
                            'web-profile'
                    )
                ) {
                    add(
                        value.url,
                        'web-profile'
                    );
                }

                for (
                    const key
                    of Object.keys(
                        value
                    )
                ) {
                    walk(
                        value[
                            key
                        ],
                        depth +
                            1
                    );
                }
            };

        walk(
            extractSoundCloudHydration(
                html
            ),
            0
        );

        return {
            links,
            sources:
                [
                    ...sources
                ]
        };
    }

    async function ensureSoundCloudProfileLinks(
        profileUrl
    ) {
        const key =
            soundCloudProfileKey(
                profileUrl
            );

        if (!key) {
            return null;
        }

        const cached =
            soundCloudProfileLinks[
                key
            ];

        if (
            cached &&
            (
                Object.keys(
                    cached.links ||
                    {}
                ).length ||
                Date.now() -
                    (
                        cached.at ||
                        0
                    ) <
                    SOUNDCLOUD_PROFILE_LINKS_RETRY_MS
            )
        ) {
            return cached;
        }

        if (
            soundCloudProfileLinksInFlight.has(
                key
            )
        ) {
            return soundCloudProfileLinksInFlight.get(
                key
            );
        }

        const task =
            (
                async () => {
                    let response;

                    try {
                        response =
                            await requestExternalPage(
                                `https://soundcloud.com/${key}`
                            );

                    } catch (
                        error
                    ) {
                        console.debug(
                            '[STRATA] SoundCloud profile fetch failed',
                            key,
                            error
                        );

                        return null;
                    }

                    const result =
                        extractSoundCloudProfileLinks(
                            response.html,
                            profileUrl
                        );

                    const found =
                        Object.keys(
                            result.links
                        );

                    console.log(
                        found.length
                            ? `[STRATA] SoundCloud profile links · ${key}: ${found.join(', ')} (from ${result.sources.join(', ')})`
                            : `[STRATA] SoundCloud profile links · ${key}: none in page (sidebar links not embedded, nothing in bio)`
                    );

                    const entry = {
                        links:
                            result.links,
                        at:
                            Date.now()
                    };

                    soundCloudProfileLinks[
                        key
                    ] =
                        entry;

                    GM_setValue(
                        SOUNDCLOUD_PROFILE_LINKS_KEY,
                        soundCloudProfileLinks
                    );

                    return entry;
                }
            )();

        soundCloudProfileLinksInFlight.set(
            key,
            task
        );

        try {
            return await task;

        } finally {
            soundCloudProfileLinksInFlight.delete(
                key
            );
        }
    }

    function currentArtistSoundCloudProfile() {
        return (
            currentLinks.find(
                link =>
                    link.service ===
                        'SoundCloud' &&
                    link.artistProfile
            ) ||
            null
        );
    }

    /*
        Applied to every render. Previously the YouTube-description profile
        enrichment ran on a copy of the release info that renderReleaseInfo()
        never used, so those links were silently dropped.
    */

    function applyArtistProfileExtras(
        releaseInfo
    ) {
        if (
            !releaseInfo
        ) {
            return releaseInfo;
        }

        enrichReleaseInfoWithVisibleProfiles(
            releaseInfo
        );

        const soundCloud =
            currentArtistSoundCloudProfile();

        if (
            soundCloud &&
            releaseInfo.artist?.name
        ) {
            if (
                !releaseInfo.artist.links.SoundCloud
            ) {
                releaseInfo.artist.links.SoundCloud =
                    soundCloud.url;
            }

            mergeMissingProfileLinks(
                releaseInfo.artist.links,
                soundCloudProfileLinks[
                    soundCloudProfileKey(
                        soundCloud.url
                    )
                ]?.links
            );
        }

        return releaseInfo;
    }

    function refreshArtistSoundCloudExtras(
        videoId
    ) {
        const soundCloud =
            currentArtistSoundCloudProfile();

        if (!soundCloud) {
            return;
        }

        ensureSoundCloudProfileLinks(
            soundCloud.url
        )
            .then(
                () => {
                    if (
                        currentVideoId() ===
                            videoId
                    ) {
                        renderReleaseInfo();
                    }
                }
            )
            .catch(
                () => {}
            );
    }

    /*
        v8.5.84: when Bandcamp vinyl is sold out, point at Discogs.
        A Discogs release/master link from the description wins; otherwise
        a Discogs search by catalogue number (most precise), else by
        artist + release / track title. No request is made — it's a link.
    */

    function currentCatalogueCode() {
        const fromDescription =
            String(
                descriptionMetadata()
                    .catalogue ||
                ''
            ).trim();

        if (fromDescription) {
            return fromDescription;
        }

        const title =
            findVideoById(
                currentVideoId()
            )?.title ||
            '';

        const codes =
            [
                ...title.matchAll(
                    /\[([^\]]+)\]/g
                )
            ]
                .map(
                    match =>
                        match[1]
                            .replace(
                                /\u200b/g,
                                ''
                            )
                            .trim()
                );

        for (
            let index =
                codes.length -
                1;
            index >=
                0;
            index--
        ) {
            if (
                catalogueFamily(
                    codes[index]
                )
            ) {
                return codes[index];
            }
        }

        return '';
    }

    function discogsUrlForCurrentRelease(
        releaseInfo
    ) {
        const direct =
            currentLinks.find(
                link =>
                    link.service ===
                        'Discogs' &&
                    /\/(?:release|master)\//i.test(
                        link.url
                    )
            );

        if (direct) {
            return direct.url;
        }

        const catalogue =
            currentCatalogueCode();

        const query =
            catalogue ||
            [
                releaseInfo?.artist?.name,
                releaseInfo?.releaseTitle ||
                    releaseInfo?.trackTitle
            ]
                .filter(
                    Boolean
                )
                .join(
                    ' '
                );

        if (
            !query.trim()
        ) {
            return '';
        }

        return `https://www.discogs.com/search/?q=${encodeURIComponent(query.trim())}&type=release`;
    }

    function renderReleaseInfo() {
        const container =
            document.getElementById(
                'strata-release-info'
            );

        if (!container) {
            return;
        }

        const releaseInfo =
            applyArtistProfileExtras(
                getCurrentReleaseInfo()
            );

        container.replaceChildren();

        if (!releaseInfo) {
            container.classList.remove(
                'visible'
            );

            return;
        }

        /*
            v8.5.78 hero restructure.

            Previously this drew a five-row labelled grid (ARTIST / TRACK /
            LABEL / EP/LP / RELEASE DATE) that duplicated the Now Playing
            title above it. It now draws a single quiet metadata line
            (artist · label · date) plus format pills (digital / vinyl),
            keeping the per-entity social icons inline. The Now Playing
            title above remains the track name, so nothing is lost — the
            duplicate rows are simply gone.
        */

        const artistName =
            capitalizeDisplayWords(
                releaseInfo.artist
                    ?.name ||
                ''
            );

        const labelName =
            capitalizeDisplayWords(
                releaseInfo.label
                    ?.name ||
                ''
            );

        const releaseDate =
            releaseInfo.released ||
            '';

        const releaseTitle =
            capitalizeDisplayWords(
                releaseInfo.releaseTitle ||
                ''
            );

        /*
            Format availability comes from the validated Bandcamp entry in
            currentLinks (same data the links list uses). If there is no
            Bandcamp match we simply show no pills.
        */

        const bandcampLink =
            currentLinks.find(
                link =>
                    link.service ===
                        'Bandcamp'
            );

        const availability =
            bandcampLink
                ?.bandcamp ||
            null;

        const metaParts =
            [
                artistName,
                labelName,
                releaseTitle,
                releaseDate
            ].filter(
                Boolean
            );

        if (
            !metaParts.length &&
            !availability
        ) {
            container.classList.remove(
                'visible'
            );

            return;
        }

        const order = [
            'Bandcamp',
            'SoundCloud',
            'Instagram',
            'Resident Advisor'
        ];

        /*
            Metadata line: artist · label · release title · date, with the
            artist's and label's social icons appended inline.
        */

        const metaLine =
            el(
                'div',
                {
                    className:
                        'strata-hero-meta'
                }
            );

        metaParts.forEach(
            (
                part,
                index
            ) => {
                if (
                    index >
                        0
                ) {
                    metaLine.appendChild(
                        el(
                            'span',
                            {
                                className:
                                    'strata-hero-dot',
                                text:
                                    '·'
                            }
                        )
                    );
                }

                const isArtist =
                    index === 0 &&
                    Boolean(
                        artistName
                    );

                const isLabel =
                    part === labelName &&
                    Boolean(
                        labelName
                    );

                const partNode =
                    el(
                        'span',
                        {
                            className:
                                isArtist
                                    ? 'strata-hero-artist'
                                    : 'strata-hero-part',
                            text:
                                part,
                            title:
                                isArtist
                                    ? `Artist radio · play more from ${part}`
                                    : isLabel
                                        ? `Label radio · play more from ${part}`
                                        : part
                        }
                    );

                if (
                    isArtist ||
                    isLabel
                ) {
                    partNode.classList.add(
                        'strata-hero-link'
                    );

                    partNode.setAttribute(
                        'role',
                        'button'
                    );

                    partNode.addEventListener(
                        'click',
                        event => {
                            event.stopPropagation();

                            startFocusRadio(
                                isArtist
                                    ? 'artist'
                                    : 'label'
                            );
                        }
                    );
                }

                metaLine.appendChild(
                    partNode
                );

                const links =
                    isArtist
                        ? releaseInfo.artist
                            ?.links
                        : isLabel
                            ? releaseInfo.label
                                ?.links
                            : null;

                if (links) {
                    for (
                        const service
                        of order
                    ) {
                        const url =
                            links?.[
                                service
                            ];

                        if (!url) {
                            continue;
                        }

                        metaLine.appendChild(
                            createProfileIcon(
                                service,
                                url,
                                part
                            )
                        );
                    }
                }
            }
        );

        container.appendChild(
            metaLine
        );

        /*
            Format pills. The available format is lit in accent; a sold-out
            or unavailable format is dimmed. Only shown when we actually have
            Bandcamp availability data.
        */

        if (availability) {
            const pillRow =
                el(
                    'div',
                    {
                        className:
                            'strata-hero-pills'
                    }
                );

            if (
                availability.digital
            ) {
                pillRow.appendChild(
                    el(
                        'span',
                        {
                            className:
                                'strata-pill strata-pill-on',
                            text:
                                'Digital'
                        }
                    )
                );
            }

            if (
                availability.vinylAvailable
            ) {
                pillRow.appendChild(
                    el(
                        'span',
                        {
                            className:
                                'strata-pill strata-pill-on',
                            text:
                                'Vinyl'
                        }
                    )
                );

            } else if (
                availability.vinylSoldOut
            ) {
                pillRow.appendChild(
                    el(
                        'span',
                        {
                            className:
                                'strata-pill strata-pill-off',
                            text:
                                'Vinyl — sold out'
                        }
                    )
                );

                const discogsUrl =
                    discogsUrlForCurrentRelease(
                        releaseInfo
                    );

                if (discogsUrl) {
                    const discogs =
                        document.createElement(
                            'a'
                        );

                    discogs.className =
                        'strata-pill strata-pill-link';

                    discogs.href =
                        discogsUrl;

                    discogs.target =
                        '_blank';

                    discogs.rel =
                        'noopener noreferrer';

                    discogs.textContent =
                        'Find on Discogs ↗';

                    discogs.title =
                        'Look for this record second-hand on Discogs';

                    discogs.addEventListener(
                        'click',
                        event =>
                            event.stopPropagation()
                    );

                    pillRow.appendChild(
                        discogs
                    );
                }
            }

            if (
                pillRow.childNodes.length
            ) {
                container.appendChild(
                    pillRow
                );
            }
        }

        container.classList.add(
            'visible'
        );
    }

    // ============================================================
    // SOUNDCLOUD — ARTIST PROFILE RESOLUTION
    // ============================================================

    /*
        Release Links often contains a direct SoundCloud TRACK URL.
        For discovery, the artist's profile is usually more useful.

        STRATA resolves it conservatively:

        1. Parse the artist from the YouTube title.
        2. If the SoundCloud track URL itself clearly belongs to that
           artist, simply strip the track slug — zero extra requests.
        3. Otherwise make ONE SoundCloud People-search request and pick
           only a very high-confidence name match.
        4. Persist the result by artist name so it is not searched again.

        If confidence is low, STRATA keeps the original SoundCloud track
        link rather than guessing the wrong artist.
    */

    function normalizeArtistLookupName(
        value
    ) {
        return String(
            value ||
            ''
        )
            .normalize(
                'NFKD'
            )
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .toLowerCase()
            .replace(
                /&/g,
                ' and '
            )
            .replace(
                /[^a-z0-9]+/g,
                ' '
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }

    function currentDescriptionRoot() {
        return (
            descriptionRoots()
                .find(
                    node =>
                        String(
                            node.innerText ||
                            node.textContent ||
                            ''
                        ).trim()
                ) ||
            null
        );
    }

    function decodeEmbeddedJsonString(
        value
    ) {
        if (!value) {
            return '';
        }

        try {
            return JSON.parse(
                `"${value}"`
            );

        } catch {
            return String(
                value
            )
                .replace(
                    /\\n/g,
                    '\n'
                )
                .replace(
                    /\\"/g,
                    '"'
                )
                .replace(
                    /\\\\/g,
                    '\\'
                );
        }
    }

    function playerResponseDescription(
        id =
            currentVideoId()
    ) {
        if (!id) {
            return '';
        }

        if (
            rawDescriptionCacheVideoId ===
                id &&
            rawDescriptionCache
        ) {
            return rawDescriptionCache;
        }

        const watchFlexy =
            document.querySelector(
                'ytd-watch-flexy'
            );

        const objectCandidates = [
            watchFlexy
                ?.data
                ?.playerResponse,
            watchFlexy
                ?.playerResponse,
            watchFlexy
                ?.playerData,
            window
                ?.ytInitialPlayerResponse
        ];

        for (
            const candidate
            of objectCandidates
        ) {
            const videoDetails =
                candidate
                    ?.videoDetails;

            if (
                videoDetails
                    ?.videoId ===
                    id &&
                videoDetails
                    ?.shortDescription
            ) {
                rawDescriptionCacheVideoId =
                    id;

                rawDescriptionCache =
                    String(
                        videoDetails
                            .shortDescription
                    );

                return rawDescriptionCache;
            }
        }

        /*
            Tampermonkey can run in an isolated world, so page globals are not
            always directly visible. The already-loaded player response is
            also present in YouTube's script data. Read it locally; there is
            no extra YouTube request.
        */

        const idNeedle =
            `"videoId":"${id}"`;

        for (
            const script
            of document.scripts
        ) {
            const text =
                script.textContent ||
                '';

            if (
                !text.includes(
                    idNeedle
                ) ||
                !text.includes(
                    '"shortDescription"'
                )
            ) {
                continue;
            }

            const match =
                text.match(
                    /"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/
                );

            if (
                match?.[1]
            ) {
                const decoded =
                    decodeEmbeddedJsonString(
                        match[
                            1
                        ]
                    );

                if (decoded) {
                    rawDescriptionCacheVideoId =
                        id;

                    rawDescriptionCache =
                        decoded;

                    return rawDescriptionCache;
                }
            }
        }

        return '';
    }

    function releaseDescriptionTextSources() {
        const sources =
            [];

        const add =
            value => {
                const text =
                    String(
                        value ||
                        ''
                    )
                        .replace(
                            /\r/g,
                            ''
                        )
                        .trim();

                if (
                    text &&
                    !sources.includes(
                        text
                    )
                ) {
                    sources.push(
                        text
                    );
                }
            };

        /*
            Prefer the full player-response description first. It is the same
            uploader text shown in YouTube's description/details UI but does
            not depend on whether "...more" is currently expanded.
        */

        add(
            playerResponseDescription()
        );

        for (
            const root
            of descriptionRoots()
        ) {
            add(
                root.textContent
            );

            add(
                root.innerText
            );
        }

        for (
            const selector
            of [
                'ytd-watch-metadata ytd-structured-description-content-renderer',
                'ytd-watch-metadata #structured-description',
                'ytd-watch-metadata #description-inner'
            ]
        ) {
            for (
                const node
                of document.querySelectorAll(
                    selector
                )
            ) {
                add(
                    node.textContent
                );

                add(
                    node.innerText
                );
            }
        }

        add(
            document.querySelector(
                'meta[itemprop="description"]'
            )
                ?.content
        );

        add(
            document.querySelector(
                'meta[name="description"]'
            )
                ?.content
        );

        for (
            const node
            of document.querySelectorAll(
                'script[type="application/ld+json"]'
            )
        ) {
            try {
                const parsed =
                    JSON.parse(
                        node.textContent ||
                        '{}'
                    );

                const entries =
                    Array.isArray(
                        parsed
                    )
                        ? parsed
                        : [
                            parsed
                        ];

                for (
                    const entry
                    of entries
                ) {
                    add(
                        entry
                            ?.description
                    );
                }

            } catch {
                // Ignore unrelated / malformed structured-data blocks.
            }
        }

        return sources;
    }

    function cleanReleaseEntityName(
        value,
        role =
            ''
    ) {
        let text =
            String(
                value ||
                    ''
            )
                .replace(
                    /https?:\/\/\S+/gi,
                    ' '
                )
                .replace(
                    /\bwww\.\S+/gi,
                    ' '
                )
                .replace(
                    /\b\S+@\S+\.\S+\b/g,
                    ' '
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (!text) {
            return '';
        }

        text =
            text
                .replace(
                    /^(?:artist|label|record\s+label)\s*(?::|\||\/|-|–|—)\s*/i,
                    ''
                )
                .replace(
                    /\s*(?:\||•|·)\s*(?:buy|listen|stream|download|follow|more\s+info|bandcamp|soundcloud|instagram|facebook|discogs|beatport)\b.*$/i,
                    ''
                )
                .replace(
                    /\s+(?:buy|listen|stream|download|follow)\s+(?:at|on|here)\b.*$/i,
                    ''
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (
            role ===
                'label'
        ) {
            /*
                Keep the actual label brand, not generic corporate suffixes.
                "Delsin Records" -> "Delsin".
            */

            text =
                text
                    .replace(
                        /\s+(?:records?|recordings?)\.?$/i,
                        ''
                    )
                    .replace(
                        /\s+(?:-|–|—|\|)\s*[A-Z]{2,}[\s-]*\d{2,}[A-Z0-9-]*\s*$/i,
                        ''
                    )
                    .trim();
        }

        const maxWords =
            role ===
                'artist'
                ? 8
                : role ===
                    'label'
                    ? 6
                    : 16;

        if (
            text.split(
                /\s+/
            ).length >
                maxWords
        ) {
            return '';
        }

        if (
            /(?:https?:|www\.|follow us|subscribe|premiere by|copyright)/i
                .test(
                    text
                )
        ) {
            return '';
        }

        if (
            role ===
                'label' &&
            /^(?:\d{4}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})$/
                .test(
                    text
                )
        ) {
            return '';
        }

        return capitalizeDisplayWords(
            text
        );
    }

    function cleanReleaseTextValue(
        value
    ) {
        return capitalizeDisplayWords(
            String(
                value ||
                    ''
            )
                .replace(
                    /https?:\/\/\S+/gi,
                    ' '
                )
                .replace(
                    /\bwww\.\S+/gi,
                    ' '
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim()
        );
    }

    function cleanReleaseDateDisplay(
        value
    ) {
        let text =
            String(
                value ||
                    ''
            )
                .replace(
                    /^\s*(?:released?|release\s+date)\s*(?::|\||\/|-|–|—)?\s*/i,
                    ''
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (!text) {
            return '';
        }

        const parsed =
            Date.parse(
                text
            );

        if (
            Number.isFinite(
                parsed
            )
        ) {
            try {
                return new Intl.DateTimeFormat(
                    'en-GB',
                    {
                        day:
                            '2-digit',
                        month:
                            '2-digit',
                        year:
                            'numeric',
                        timeZone:
                            'UTC'
                    }
                )
                    .format(
                        new Date(
                            parsed
                        )
                    );

            } catch {}
        }

        return text;
    }

    function parseReleaseMetadataText(
        input
    ) {
        const text =
            String(
                input ||
                ''
            )
                .replace(
                    /\r/g,
                    ''
                )
                .trim();

        const lines =
            text
                .split(
                    '\n'
                )
                .map(
                    line =>
                        line
                            .replace(
                                /\s+/g,
                                ' '
                            )
                            .trim()
                )
                .filter(
                    Boolean
                );

        const field =
            patterns => {
                for (
                    const line
                    of lines
                ) {
                    for (
                        const pattern
                        of patterns
                    ) {
                        const match =
                            line.match(
                                pattern
                            );

                        if (
                            match?.[1]
                        ) {
                            return String(
                                match[
                                    1
                                ]
                            )
                                .replace(
                                    /\s+/g,
                                    ' '
                                )
                                .trim();
                        }
                    }
                }

                return '';
            };

        let artistName =
            field([
                /^Artist\s*(?::|\||\/|-|–|—)\s*(.+)$/i,
                /^Artist\s+(.+)$/i
            ]);

        for (
            const line
            of lines.slice(
                0,
                20
            )
        ) {
            if (artistName) {
                break;
            }

            if (
                /^(?:label|record\s+label|cat(?:\.|alog(?:ue)?)?#?|format|country|released?|release\s+date)\b/i
                    .test(
                        line
                    )
            ) {
                continue;
            }

            const match =
                line.match(
                    /^(.+?)\s[-–—]\s.+$/
                );

            if (
                match?.[1] &&
                !/^(?:premiere|official|full track|track)$/i
                    .test(
                        match[
                            1
                        ].trim()
                    )
            ) {
                artistName =
                    match[
                        1
                    ]
                        .replace(
                            /\s+/g,
                            ' '
                        )
                        .trim();

                break;
            }
        }

        let label =
            field([
                /^(?:Release\s+)?Label\s*(?::|\||\/|-|–|—)\s*(.+)$/i,
                /^Record\s+Label\s*(?::|\||\/|-|–|—)\s*(.+)$/i,
                /^Label\s+(.+)$/i
            ]);

        if (!label) {
            const releasedBy =
                field([
                    /^Released?\s+(?:on|by)\s*(?::|\||\/|-|–|—)?\s*(.+)$/i
                ]);

            if (
                releasedBy &&
                !/^\d{4}\b/.test(
                    releasedBy
                ) &&
                !/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
                    .test(
                        releasedBy
                    )
            ) {
                label =
                    releasedBy;
            }
        }

        label =
            cleanReleaseEntityName(
                label,
                'label'
            );

        artistName =
            cleanReleaseEntityName(
                artistName,
                'artist'
            );

        const title =
            cleanReleaseTextValue(
                field([
                    /^(?:Track|Title)\s*(?::|\||\/|-|–|—)\s*(.+)$/i
                ])
            );

        const releaseTitle =
            cleanReleaseTextValue(
                field([
                    /^(?:EP|LP|Album|Release\s+Title)\s*(?::|\||\/|-|–|—)\s*(.+)$/i
                ])
            );

        return {
            text,
            lines,
            artistName,
            title,
            label,
            releaseTitle,
            catalogue:
                field([
                    /^(?:Cat(?:\.|alog(?:ue)?)?#?|Catalogue\s+No\.?)\s*(?::|\||\/|-|–|—)\s*(.+)$/i
                ]),
            format:
                field([
                    /^Format\s*(?::|\||\/|-|–|—)\s*(.+)$/i
                ]),
            country:
                field([
                    /^Country\s*(?::|\||\/|-|–|—)\s*(.+)$/i
                ]),
            released:
                cleanReleaseDateDisplay(
                    field([
                        /^(?:Released?|Release\s+Date)\s*(?::|\||\/|-|–|—)\s*(.+)$/i
                    ])
                )
        };
    }

    function resetReleaseMetadataSnapshot(
        id =
            currentVideoId()
    ) {
        releaseMetadataVideoId =
            id ||
            null;

        releaseMetadataSnapshot = {
            artistName:
                '',
            title:
                '',
            releaseTitle:
                '',
            label:
                '',
            catalogue:
                '',
            format:
                '',
            country:
                '',
            released:
                ''
        };

        if (
            rawDescriptionCacheVideoId !==
                id
        ) {
            rawDescriptionCacheVideoId =
                null;

            rawDescriptionCache =
                '';
        }
    }

    function mergeReleaseMetadata(
        candidate,
        id =
            currentVideoId()
    ) {
        if (
            releaseMetadataVideoId !==
                id ||
            !releaseMetadataSnapshot
        ) {
            resetReleaseMetadataSnapshot(
                id
            );
        }

        const snapshot =
            releaseMetadataSnapshot;

        for (
            const key
            of [
                'artistName',
                'title',
                'releaseTitle',
                'label',
                'catalogue',
                'format',
                'country',
                'released'
            ]
        ) {
            const value =
                String(
                    candidate?.[
                        key
                    ] ||
                    ''
                )
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();

            /*
                Never replace a known non-empty field with an empty transient
                DOM read. Prefer the first complete uploader/player-response
                value; Bandcamp can still fill a missing field later.
            */

            if (
                value &&
                !snapshot[
                    key
                ]
            ) {
                snapshot[
                    key
                ] =
                    value;
            }
        }

        if (
            snapshot.catalogue &&
            snapshot.label
        ) {
            releaseLabelByCatalogue.set(
                snapshot.catalogue
                    .toUpperCase(),
                snapshot.label
            );
        }

        if (
            snapshot.catalogue &&
            !snapshot.label
        ) {
            const rememberedLabel =
                releaseLabelByCatalogue.get(
                    snapshot.catalogue
                        .toUpperCase()
                );

            if (rememberedLabel) {
                snapshot.label =
                    rememberedLabel;
            }
        }

        return snapshot;
    }

    function descriptionMetadata() {
        const id =
            currentVideoId();

        if (
            releaseMetadataVideoId !==
                id ||
            !releaseMetadataSnapshot
        ) {
            resetReleaseMetadataSnapshot(
                id
            );
        }

        let bestRoot =
            null;

        let bestText =
            '';

        let bestLines =
            [];

        for (
            const source
            of releaseDescriptionTextSources()
        ) {
            const parsed =
                parseReleaseMetadataText(
                    source
                );

            mergeReleaseMetadata(
                parsed,
                id
            );

            if (
                parsed.text.length >
                    bestText.length
            ) {
                bestText =
                    parsed.text;

                bestLines =
                    parsed.lines;
            }
        }

        bestRoot =
            currentDescriptionRoot();

        return {
            root:
                bestRoot,
            text:
                bestText,
            lines:
                bestLines,
            ...releaseMetadataSnapshot
        };
    }

    function artistNameFromYouTubeTitle() {
        const descriptionArtist =
            descriptionMetadata()
                .artistName;

        if (descriptionArtist) {
            return descriptionArtist;
        }

        const id =
            currentVideoId();

        const cached =
            findVideoById(
                id
            );

        const heading =
            document.querySelector(
                'ytd-watch-metadata h1 yt-formatted-string, ' +
                'ytd-watch-metadata h1, ' +
                '#title h1 yt-formatted-string'
            )?.textContent;

        let title =
            String(
                cached?.title ||
                heading ||
                document.title
                    .replace(
                        /\s*-\s*YouTube\s*$/i,
                        ''
                    ) ||
                ''
            )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (!title) {
            return '';
        }

        /*
            Channels often prepend things such as:
            "IP PREMIERE | Artist - Track".
            Prefer the pipe segment that actually looks like
            "Artist - Track".
        */

        const pipeSegments =
            title
                .split('|')
                .map(
                    part =>
                        part.trim()
                )
                .filter(
                    Boolean
                );

        const musicalSegment =
            pipeSegments.find(
                part =>
                    /\s[-–—]\s/.test(
                        part
                    )
            );

        if (musicalSegment) {
            title =
                musicalSegment;
        }

        title =
            title
                .replace(
                    /^\s*[\[(][^\])]*(?:premiere|exclusive|free download|official)[^\])]*[\])]\s*/i,
                    ''
                )
                .replace(
                    /^\s*(?:[a-z0-9._-]+\s+)?premiere\s*[:|]\s*/i,
                    ''
                )
                .trim();

        const split =
            title.match(
                /^(.+?)\s[-–—]\s.+$/
            );

        if (!split) {
            return '';
        }

        let artist =
            split[1]
                .replace(
                    /^\s*(?:premiere|exclusive)\s*[:|-]?\s*/i,
                    ''
                )
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        /*
            Avoid obviously non-artist prefixes if a title slips through.
        */

        if (
            !artist ||
            /^(?:premiere|official|full track|track)$/i
                .test(
                    artist
                )
        ) {
            return '';
        }

        return artist;
    }

    function trackNameFromYouTubeTitle() {
        /*
            The currently playing track's name comes from the YouTube video
            title, NOT from the description's "Title:" field. On multi-track
            releases (albums, EPs, VA compilations) the description "Title:"
            names the whole release (e.g. an LP title), while each uploaded
            video is a specific track. Reading the description title here
            caused the release title to be shown as the track name, and also
            defeated the EP/LP promotion in getCurrentReleaseInfo (which
            needs the real video-derived track name to compare against the
            release title). getCurrentReleaseInfo still uses the description
            title as a fallback and promotes it to EP/LP when appropriate.
        */

        const id =
            currentVideoId();

        const cached =
            findVideoById(
                id
            );

        const heading =
            document.querySelector(
                'ytd-watch-metadata h1 yt-formatted-string, ' +
                'ytd-watch-metadata h1, ' +
                '#title h1 yt-formatted-string'
            )?.textContent;

        let title =
            cleanNowPlayingTitle(
                cached?.title ||
                heading ||
                document.title
                    .replace(
                        /\s*-\s*YouTube\s*$/i,
                        ''
                    ) ||
                ''
            );

        const pipeSegments =
            title
                .split(
                    '|'
                )
                .map(
                    part =>
                        part.trim()
                )
                .filter(
                    Boolean
                );

        const musicalSegment =
            pipeSegments.find(
                part =>
                    /\s[-–—]\s/.test(
                        part
                    )
            );

        if (musicalSegment) {
            title =
                musicalSegment;
        }

        const split =
            title.match(
                /^.+?\s[-–—]\s(.+)$/
            );

        return cleanReleaseTextValue(
            split?.[1] ||
            title
        );
    }

    function normalizedReleaseTitle(
        value
    ) {
        return String(
            value ||
                ''
        )
            .toLocaleLowerCase()
            .normalize(
                'NFKD'
            )
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .replace(
                /\b(?:official|audio|video|premiere|full\s+track)\b/g,
                ' '
            )
            .replace(
                /[^a-z0-9]+/g,
                ' '
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }

    function sameReleaseTitle(
        first,
        second
    ) {
        const a =
            normalizedReleaseTitle(
                first
            );

        const b =
            normalizedReleaseTitle(
                second
            );

        return Boolean(
            a &&
            b &&
            a ===
                b
        );
    }

    function youtubeUploaderIdentityNames() {
        const id =
            currentVideoId();

        const cached =
            findVideoById(
                id
            );

        const values = [
            cached?.channelHandle,
            document.querySelector(
                'ytd-watch-metadata #owner #channel-name a, ' +
                'ytd-watch-metadata ytd-channel-name #text a, ' +
                '#owner #channel-name a'
            )?.textContent,
            document.querySelector(
                'ytd-watch-metadata #owner #channel-name, ' +
                'ytd-watch-metadata ytd-channel-name'
            )?.textContent
        ];

        return [
            ...new Set(
                values
                    .map(
                        value =>
                            String(
                                value ||
                                ''
                            )
                                .replace(/^@/, '')
                                .replace(/\s+/g, ' ')
                                .trim()
                    )
                    .filter(Boolean)
            )
        ];
    }

    function descriptionContextBeforeAnchor(
        root,
        anchor
    ) {
        try {
            const range =
                document.createRange();

            range.setStart(
                root,
                0
            );

            range.setEndBefore(
                anchor
            );

            const text =
                String(
                    range.toString() ||
                    ''
                )
                    .replace(/\r/g, '')
                    .trim();

            const lines =
                text
                    .split('\n')
                    .map(
                        line =>
                            line
                                .replace(/\s+/g, ' ')
                                .trim()
                    )
                    .filter(Boolean);

            return {
                text,
                lines,
                recent:
                    lines.slice(-5)
            };

        } catch {
            return {
                text: '',
                lines: [],
                recent: []
            };
        }
    }

    function descriptionAnchorRole(
        root,
        anchor
    ) {
        /*
            "Follow artist" used to stay logically active forever because
            we only compared it with "Follow label". On YouTube's expanded
            description, the appended channel card comes later in the same
            container, so the uploader's SoundCloud could accidentally earn
            the artist-section bonus.

            Treat headings/boundaries as real sections: the most recent
            marker before an anchor owns that anchor. Generic channel-card
            markers terminate the creator-written social section.
        */

        const context =
            descriptionContextBeforeAnchor(
                root,
                anchor
            );

        const lower =
            context.text
                .toLowerCase();

        const markers = [
            {
                text: 'follow artist',
                role: 'artist'
            },
            {
                text: 'follow label',
                role: 'label'
            },
            {
                text: 'buy links',
                role: null
            },
            {
                text: 'disclaimer',
                role: null
            },
            {
                text: 'no copyright infringement',
                role: null
            },
            {
                text: 'uploaded in low quality',
                role: null
            },
            {
                text: 'subscribers',
                role: null
            }
        ];

        let latestIndex =
            -1;

        let role =
            null;

        for (
            const marker
            of markers
        ) {
            const index =
                lower.lastIndexOf(
                    marker.text
                );

            if (
                index >
                latestIndex
            ) {
                latestIndex =
                    index;

                role =
                    marker.role;
            }
        }

        return role;
    }

    function descriptionAnchorIsAppendedChannelCard(
        root,
        anchor
    ) {
        if (
            !root ||
            !anchor
        ) {
            return false;
        }

        /*
            Prefer structural evidence when YouTube exposes it.
        */

        if (
            anchor.closest(
                '#bio-container, #band-info, #owner, #channel-name, ytd-channel-name'
            )
        ) {
            return true;
        }

        const context =
            descriptionContextBeforeAnchor(
                root,
                anchor
            );

        const recent =
            context.lines
                .slice(-10)
                .map(
                    line =>
                        line
                            .toLowerCase()
                            .trim()
                );

        const hasSubscriberMarker =
            recent.some(
                line =>
                    /\bsubscribers?\b/i
                        .test(
                            line
                        )
            );

        const hasVideos =
            recent.some(
                line =>
                    /^videos?$/i
                        .test(
                            line
                        )
            );

        const hasAbout =
            recent.some(
                line =>
                    /^about$/i
                        .test(
                            line
                        )
            );

        return (
            hasSubscriberMarker ||
            (
                hasVideos &&
                hasAbout
            )
        );
    }

    function descriptionSoundCloudArtistProfile(
        artistName
    ) {
        const metadata =
            descriptionMetadata();

        const root =
            metadata.root;

        if (
            !root ||
            !artistName
        ) {
            return null;
        }

        const target =
            normalizeArtistLookupName(
                artistName
            );

        const uploaderNames =
            youtubeUploaderIdentityNames();

        const hasExplicitArtistSection =
            /\bfollow artist\b/i
                .test(
                    metadata.text ||
                    ''
                );

        let best =
            null;

        for (
            const anchor
            of root.querySelectorAll(
                'a[href]'
            )
        ) {
            const match =
                classifyMusicUrl(
                    unwrapYouTubeRedirect(
                        anchor.href
                    )
                );

            if (
                !match ||
                match.service !==
                    'SoundCloud'
            ) {
                continue;
            }

            const profile =
                soundCloudProfileFromTrackUrl(
                    match.url
                );

            if (!profile) {
                continue;
            }

            if (
                descriptionAnchorIsAppendedChannelCard(
                    root,
                    anchor
                )
            ) {
                continue;
            }

            const role =
                descriptionAnchorRole(
                    root,
                    anchor
                );

            /*
                When the curator explicitly supplies a "Follow artist"
                section, only SoundCloud links inside that bounded section
                may be promoted to ARTIST PROFILE. This is intentionally
                strict: a missing artist link is better than PARADIGMAS,
                Analogue Network, Indefinite Pitch, etc. being shown as the
                artist.
            */

            if (
                hasExplicitArtistSection &&
                role !==
                    'artist'
            ) {
                continue;
            }

            const context =
                descriptionContextBeforeAnchor(
                    root,
                    anchor
                );

            const recent =
                context.recent;

            const anchorText =
                String(
                    anchor.textContent ||
                    ''
                )
                    .replace(/\s+/g, ' ')
                    .trim();

            let score =
                soundCloudNameScore(
                    artistName,
                    {
                        permalink:
                            profile.slug,
                        username:
                            anchorText ||
                            profile.slug
                    }
                );

            const recentNormalized =
                recent.map(
                    normalizeArtistLookupName
                );

            /*
                A social link immediately following the artist name in
                the description is strong evidence that it belongs to
                the artist, even when the SoundCloud slug differs a bit
                (for example Overturn -> overturntechno).
            */

            if (
                role ===
                    'artist'
            ) {
                score +=
                    140;
            }

            if (
                role ===
                    'label'
            ) {
                score -=
                    160;
            }

            if (
                recentNormalized.some(
                    line =>
                        line ===
                            target ||
                        (
                            target.length >=
                                4 &&
                            (
                                line.includes(
                                    target
                                ) ||
                                target.includes(
                                    line
                                )
                            )
                        )
                )
            ) {
                score +=
                    70;
            }

            if (
                normalizeArtistLookupName(
                    anchorText
                ) ===
                target
            ) {
                score +=
                    70;
            }

            /*
                Do not mistake the YouTube uploader's own SoundCloud
                profile for the artist. This was the Indefinite Pitch /
                PARADIGMAS failure mode.
            */

            const uploaderMatch =
                uploaderNames.some(
                    uploader =>
                        soundCloudNameScore(
                            uploader,
                            {
                                permalink:
                                    profile.slug,
                                username:
                                    anchorText ||
                                    profile.slug
                            }
                        ) >=
                            82
                );

            if (
                uploaderMatch &&
                soundCloudNameScore(
                    artistName,
                    {
                        permalink:
                            profile.slug,
                        username:
                            anchorText ||
                            profile.slug
                    }
                ) <
                    82
            ) {
                score -=
                    180;
            }

            if (
                recent.some(
                    line =>
                        /^(?:about|videos?|subscribers?)\b/i
                            .test(
                                line
                            )
                )
            ) {
                score -=
                    100;
            }

            if (
                !best ||
                score >
                    best.score
            ) {
                best = {
                    url:
                        profile.url,
                    score,
                    sourceUrl:
                        match.url
                };
            }
        }

        return (
            best &&
            best.score >=
                82
        )
            ? best
            : null;
    }

    function soundCloudProfileFromTrackUrl(
        value
    ) {
        try {
            const url =
                new URL(
                    value
                );

            const host =
                url.hostname
                    .toLowerCase()
                    .replace(
                        /^www\./,
                        ''
                    );

            if (
                host !==
                'soundcloud.com'
            ) {
                return null;
            }

            const parts =
                url.pathname
                    .split('/')
                    .filter(
                        Boolean
                    );

            if (
                !parts.length ||
                [
                    'search',
                    'discover',
                    'you',
                    'stream',
                    'charts'
                ].includes(
                    parts[0]
                        .toLowerCase()
                )
            ) {
                return null;
            }

            return {
                url:
                    `https://soundcloud.com/${parts[0]}`,
                slug:
                    parts[0],
                alreadyProfile:
                    parts.length ===
                    1
            };

        } catch {
            return null;
        }
    }

    function soundCloudNameScore(
        artistName,
        candidate
    ) {
        const target =
            normalizeArtistLookupName(
                artistName
            );

        if (!target) {
            return 0;
        }

        const values = [
            candidate?.username,
            candidate?.full_name,
            candidate?.permalink
        ]
            .map(
                normalizeArtistLookupName
            )
            .filter(
                Boolean
            );

        let best =
            0;

        const targetTokens =
            new Set(
                target.split(' ')
            );

        for (
            const value
            of values
        ) {
            if (
                value ===
                target
            ) {
                best =
                    Math.max(
                        best,
                        100
                    );

                continue;
            }

            if (
                target.length >=
                    5 &&
                value.length >=
                    5 &&
                (
                    value.includes(
                        target
                    ) ||
                    target.includes(
                        value
                    )
                )
            ) {
                best =
                    Math.max(
                        best,
                        88
                    );
            }

            const valueTokens =
                new Set(
                    value.split(' ')
                );

            let common =
                0;

            for (
                const token
                of targetTokens
            ) {
                if (
                    token.length >=
                        2 &&
                    valueTokens.has(
                        token
                    )
                ) {
                    common++;
                }
            }

            const union =
                new Set([
                    ...targetTokens,
                    ...valueTokens
                ]).size;

            if (union) {
                best =
                    Math.max(
                        best,
                        Math.round(
                            common /
                            union *
                            84
                        )
                    );
            }
        }

        return best;
    }

    function extractBalancedJsonValue(
        text,
        start
    ) {
        const opening =
            text[
                start
            ];

        const closing =
            opening ===
                '['
                ? ']'
                : opening ===
                    '{'
                    ? '}'
                    : null;

        if (!closing) {
            return null;
        }

        let depth =
            0;

        let inString =
            false;

        let escaped =
            false;

        for (
            let index = start;
            index < text.length;
            index++
        ) {
            const char =
                text[
                    index
                ];

            if (inString) {
                if (escaped) {
                    escaped =
                        false;

                } else if (
                    char ===
                    '\\'
                ) {
                    escaped =
                        true;

                } else if (
                    char ===
                    '"'
                ) {
                    inString =
                        false;
                }

                continue;
            }

            if (
                char ===
                '"'
            ) {
                inString =
                    true;

                continue;
            }

            if (
                char ===
                opening
            ) {
                depth++;

            } else if (
                char ===
                closing
            ) {
                depth--;

                if (
                    depth ===
                    0
                ) {
                    return text.slice(
                        start,
                        index +
                            1
                    );
                }
            }
        }

        return null;
    }

    function extractSoundCloudHydration(
        html
    ) {
        const source =
            String(
                html ||
                ''
            );

        const marker =
            'window.__sc_hydration';

        const markerIndex =
            source.indexOf(
                marker
            );

        if (
            markerIndex ===
            -1
        ) {
            return null;
        }

        const start =
            source.indexOf(
                '[',
                markerIndex
            );

        if (
            start ===
            -1
        ) {
            return null;
        }

        const raw =
            extractBalancedJsonValue(
                source,
                start
            );

        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(
                raw
            );

        } catch {
            return null;
        }
    }

    function collectSoundCloudUserCandidates(
        value,
        output = [],
        seen = new Set()
    ) {
        if (
            !value ||
            typeof value !==
                'object'
        ) {
            return output;
        }

        if (
            value.kind ===
                'user' &&
            value.permalink_url &&
            (
                value.username ||
                value.full_name
            )
        ) {
            const key =
                String(
                    value.permalink_url
                );

            if (
                !seen.has(
                    key
                )
            ) {
                seen.add(
                    key
                );

                output.push({
                    username:
                        value.username ||
                        '',
                    full_name:
                        value.full_name ||
                        '',
                    permalink:
                        value.permalink ||
                        '',
                    permalink_url:
                        value.permalink_url
                });
            }
        }

        const children =
            Array.isArray(
                value
            )
                ? value
                : Object.values(
                    value
                );

        for (
            const child
            of children
        ) {
            collectSoundCloudUserCandidates(
                child,
                output,
                seen
            );
        }

        return output;
    }

    function saveSoundCloudArtistProfiles() {
        GM_setValue(
            SOUNDCLOUD_ARTIST_CACHE_KEY,
            soundCloudArtistProfiles
        );
    }

    async function resolveSoundCloudArtistProfile(
        artistName,
        sourceUrl
    ) {
        const artistKey =
            normalizeArtistLookupName(
                artistName
            );

        if (!artistKey) {
            return null;
        }

        const cached =
            soundCloudArtistProfiles[
                artistKey
            ];

        if (
            cached &&
            typeof cached ===
                'object'
        ) {
            if (cached.url) {
                const cachedProfile =
                    soundCloudProfileFromTrackUrl(
                        cached.url
                    );

                const cachedLooksLikeUploader =
                    cachedProfile &&
                    youtubeUploaderIdentityNames()
                        .some(
                            uploader =>
                                soundCloudNameScore(
                                    uploader,
                                    {
                                        permalink:
                                            cachedProfile.slug,
                                        username:
                                            cachedProfile.slug
                                    }
                                ) >=
                                    82
                        ) &&
                    soundCloudNameScore(
                        artistName,
                        {
                            permalink:
                                cachedProfile.slug,
                            username:
                                cachedProfile.slug
                        }
                    ) <
                        82;

                if (
                    !cachedLooksLikeUploader
                ) {
                    return cached.url;
                }

                /*
                    Older STRATA builds could persist an uploader profile
                    as the artist. Drop that stale mapping and resolve this
                    artist again instead of carrying the mistake forward.
                */

                delete soundCloudArtistProfiles[
                    artistKey
                ];

                saveSoundCloudArtistProfiles();
            }

            /*
                A failed lookup may simply have been a temporary
                SoundCloud response/layout issue. Retry misses after
                24 hours, while successful matches remain persistent.
            */

            if (
                cached.resolvedAt &&
                Date.now() -
                    cached.resolvedAt <
                    24 * 60 * 60 * 1000
            ) {
                return null;
            }

            delete soundCloudArtistProfiles[
                artistKey
            ];
        }

        const direct =
            soundCloudProfileFromTrackUrl(
                sourceUrl
            );

        if (direct) {
            if (
                soundCloudNameScore(
                    artistName,
                    {
                        permalink:
                            direct.slug,
                        username:
                            direct.slug
                    }
                ) >=
                    82
            ) {
                soundCloudArtistProfiles[
                    artistKey
                ] = {
                    url:
                        direct.url,
                    resolvedAt:
                        Date.now(),
                    method:
                        'track-url'
                };

                saveSoundCloudArtistProfiles();

                return direct.url;
            }
        }

        /*
            If the uploader/profile in the track URL does not resemble
            the YouTube artist name, ask SoundCloud's own People search.
            This is a SoundCloud request, not a YouTube request.
        */

        try {
            const response =
                await requestExternalPage(
                    'https://soundcloud.com/search/people' +
                    `?q=${encodeURIComponent(artistName)}`
                );

            const hydration =
                extractSoundCloudHydration(
                    response.html
                );

            const candidates =
                collectSoundCloudUserCandidates(
                    hydration
                )
                    .map(
                        candidate => ({
                            ...candidate,
                            score:
                                soundCloudNameScore(
                                    artistName,
                                    candidate
                                )
                        })
                    )
                    .sort(
                        (a, b) =>
                            b.score -
                            a.score
                    );

            const best =
                candidates[
                    0
                ];

            /*
                Require a strong match.  Wrong artist is worse than
                leaving the original track link untouched.
            */

            if (
                best &&
                best.score >=
                    82 &&
                /^https:\/\/soundcloud\.com\//i
                    .test(
                        best.permalink_url
                    )
            ) {
                soundCloudArtistProfiles[
                    artistKey
                ] = {
                    url:
                        best.permalink_url,
                    resolvedAt:
                        Date.now(),
                    method:
                        'people-search',
                    matchedName:
                        best.username ||
                        best.full_name ||
                        ''
                };

                saveSoundCloudArtistProfiles();

                return best.permalink_url;
            }

        } catch (
            error
        ) {
            console.debug(
                '[STRATA] SoundCloud artist lookup skipped',
                artistName,
                error
            );
        }

        /*
            Remember a miss for this resolver version so the same artist
            does not cause repeated SoundCloud searches every shuffle.
        */

        soundCloudArtistProfiles[
            artistKey
        ] = {
            url:
                null,
            resolvedAt:
                Date.now(),
            method:
                'no-confident-match'
        };

        saveSoundCloudArtistProfiles();

        return null;
    }

    async function promoteSoundCloudLinkToArtistProfile(
        links
    ) {
        const soundCloudIndex =
            links.findIndex(
                link =>
                    link.service ===
                        'SoundCloud'
            );

        if (
            soundCloudIndex ===
            -1
        ) {
            return;
        }

        const soundCloud =
            links[
                soundCloudIndex
            ];

        const artistName =
            artistNameFromYouTubeTitle();

        if (!artistName) {
            return;
        }

        /*
            First choice: an explicit SoundCloud profile in the actual
            video description that can be associated with the artist.
            This uses the metadata the curator already supplied and
            avoids accidentally promoting the channel/uploader profile.
        */

        const descriptionProfile =
            descriptionSoundCloudArtistProfile(
                artistName
            );

        let profileUrl =
            descriptionProfile
                ?.url ||
            null;

        if (!profileUrl) {
            profileUrl =
                await resolveSoundCloudArtistProfile(
                    artistName,
                    soundCloud.url
                );
        }

        if (!profileUrl) {
            const sourceProfile =
                soundCloudProfileFromTrackUrl(
                    soundCloud.url
                );

            const sourceLooksLikeUploader =
                sourceProfile &&
                youtubeUploaderIdentityNames()
                    .some(
                        uploader =>
                            soundCloudNameScore(
                                uploader,
                                {
                                    permalink:
                                        sourceProfile.slug,
                                    username:
                                        sourceProfile.slug
                                }
                            ) >=
                                82
                    );

            const sourceLooksLikeArtist =
                sourceProfile &&
                soundCloudNameScore(
                    artistName,
                    {
                        permalink:
                            sourceProfile.slug,
                        username:
                            sourceProfile.slug
                    }
                ) >=
                    82;

            /*
                If the only SoundCloud URL is clearly the YouTube
                channel's own profile, do not show a confidently wrong
                link. Keep genuine track/label links as a fallback.
            */

            if (
                sourceProfile
                    ?.alreadyProfile &&
                sourceLooksLikeUploader &&
                !sourceLooksLikeArtist
            ) {
                links.splice(
                    soundCloudIndex,
                    1
                );
            }

            return;
        }

        if (
            profileUrl !==
            soundCloud.url
        ) {
            soundCloud.trackUrl =
                soundCloud.url;
        }

        soundCloud.url =
            profileUrl;

        soundCloud.artistProfile =
            true;

        soundCloud.artistName =
            artistName;

        soundCloud.profileSource =
            descriptionProfile
                ? 'description'
                : 'soundcloud-search';
    }

    async function chooseBestBandcamp(
        candidates
    ) {
        const ranked =
            candidates
                .filter(
                    candidate =>
                        candidate.service ===
                        'Bandcamp'
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        scoreLink(
                            b,
                            b.source
                        ) -
                        scoreLink(
                            a,
                            a.source
                        )
                );

        for (
            const candidate
            of ranked
        ) {
            try {
                const response =
                    await requestExternalPage(
                        candidate.url
                    );

                if (
                    bandcampLooksDead(
                        response.html
                    )
                ) {
                    continue;
                }

                return {
                    ...candidate,

                    url:
                        response.finalUrl,

                    bandcamp: {
                        ...parseBandcampAvailability(
                            response.html
                        ),

                        releaseInfo:
                            parseBandcampReleaseInfo(
                                response.html,
                                response.finalUrl
                            )
                    }
                };

            } catch {}
        }

        return null;
    }

    async function chooseBestLinks(
        candidates
    ) {
        const best =
            new Map();

        const bandcamp =
            await chooseBestBandcamp(
                candidates
            );

        if (bandcamp) {
            best.set(
                'Bandcamp',
                bandcamp
            );
        }

        for (
            const candidate
            of candidates
        ) {
            if (
                candidate.service ===
                'Bandcamp'
            ) {
                continue;
            }

            const candidateScore =
                scoreLink(
                    candidate,
                    candidate.source
                );

            const existing =
                best.get(
                    candidate.service
                );

            if (
                !existing ||
                candidateScore >
                    existing.__score
            ) {
                best.set(
                    candidate.service,
                    {
                        ...candidate,

                        __score:
                            candidateScore
                    }
                );
            }
        }

        return [
            ...best.values()
        ]
            .sort(
                (
                    a,
                    b
                ) =>
                    (
                        MUSIC_SERVICE_PRIORITY[
                            a.service
                        ] ||
                        999
                    ) -
                    (
                        MUSIC_SERVICE_PRIORITY[
                            b.service
                        ] ||
                        999
                    )
            )
            .map(
                item => {
                    const clean = {
                        ...item
                    };

                    delete clean.__score;
                    delete clean.normalized;
                    delete clean.host;
                    delete clean.pathname;

                    return clean;
                }
            );
    }

    async function scanCurrentLinks() {
        const id =
            currentVideoId();

        if (!id) {
            return;
        }

        const cache =
            readSessionObject(
                LINK_CACHE_SESSION_KEY
            );

        /*
            Only trust a cached result when it actually contains links.
            Previous builds could scan before YouTube hydrated the
            description and permanently cache an empty array.
        */

        if (
            Array.isArray(
                cache[
                    id
                ]
            ) &&
            cache[
                id
            ].length
        ) {
            currentLinks =
                cache[
                    id
                ];

            lastLinkScanVideoId =
                id;

            renderLinks();

            const cachedReleaseInfo =
                getCurrentReleaseInfo();

            if (
                cachedReleaseInfo
            ) {
                enrichReleaseInfoWithVisibleProfiles(
                    cachedReleaseInfo
                );
            }

            renderReleaseInfo();

            refreshArtistSoundCloudExtras(
                id
            );

            return;
        }

        setLinksMessage(
            'Reading video description…'
        );

        /*
            Capture Release Info directly from YouTube's already-loaded
            player/details data. This is independent of Bandcamp validation.
        */

        const initialReleaseInfo =
            getCurrentReleaseInfo();

        if (initialReleaseInfo) {
            enrichReleaseInfoWithVisibleProfiles(
                initialReleaseInfo
            );

            renderReleaseInfo();
        }

        /*
            YouTube hydrates the description asynchronously. Waiting here
            is important: scanning at ~450 ms was the main reason STRATA
            sometimes reported "No release links" even when the uploader
            had supplied Bandcamp/SoundCloud/Juno links.
        */

        await waitForDescriptionReady(
            6000
        );

        const descriptionScanState =
            await prepareDescriptionForLinkScan();

        if (
            currentVideoId() !==
            id
        ) {
            restoreDescriptionAfterLinkScan(
                descriptionScanState
            );

            return;
        }

        /*
            While the real description is expanded, capture once more so any
            DOM-only Label/Catalogue fields become sticky for this track.
        */

        descriptionMetadata();

        const candidates =
            [];

        const rawDescription =
            playerResponseDescription(
                id
            );

        if (rawDescription) {
            extractLinksFromText(
                rawDescription,
                candidates,
                'Description'
            );
        }

        scanVisibleDescription(
            candidates
        );

        scanLoadedComments(
            candidates
        );

        if (
            !candidates.length
        ) {
            currentLinks =
                [];

            lastLinkScanVideoId =
                id;

            /*
                Do not write an empty result to session cache. If YouTube
                was still rebuilding its description, closing/reopening
                Release Links can safely try again.
            */

            setLinksMessage(
                'No release links found'
            );

            const descriptionOnlyInfo =
                getCurrentReleaseInfo();

            if (
                descriptionOnlyInfo
            ) {
                enrichReleaseInfoWithVisibleProfiles(
                    descriptionOnlyInfo
                );
            }

            renderReleaseInfo();

            restoreDescriptionAfterLinkScan(
                descriptionScanState
            );

            return;
        }

        setLinksMessage(
            'Checking release links…'
        );

        currentLinks =
            await chooseBestLinks(
                candidates
            );

        await promoteSoundCloudLinkToArtistProfile(
            currentLinks
        );

        refreshArtistSoundCloudExtras(
            id
        );

        const releaseInfo =
            getCurrentReleaseInfo();

        if (releaseInfo) {
            enrichReleaseInfoWithVisibleProfiles(
                releaseInfo
            );
        }

        if (
            currentLinks.length
        ) {
            cache[
                id
            ] =
                currentLinks;

            writeSessionObject(
                LINK_CACHE_SESSION_KEY,
                cache
            );
        }

        lastLinkScanVideoId =
            id;

        renderLinks();
        renderReleaseInfo();

        restoreDescriptionAfterLinkScan(
            descriptionScanState
        );
    }

    function formatLinkDetail(
        link
    ) {
        if (
            link.service ===
                'SoundCloud' &&
            link.artistProfile
        ) {
            return 'ARTIST PROFILE';
        }

        if (
            link.service !==
                'Bandcamp' ||
            !link.bandcamp
        ) {
            return link.source;
        }

        const availability =
            link.bandcamp;

        if (
            availability.digital &&
            !availability.vinyl
        ) {
            return 'DIGITAL ONLY';
        }

        if (
            availability.digital &&
            availability.vinylAvailable
        ) {
            return 'DIGITAL  ·  VINYL';
        }

        if (
            availability.digital &&
            availability.vinylSoldOut
        ) {
            return 'DIGITAL  ·  VINYL SOLD OUT';
        }

        if (
            availability.vinylAvailable
        ) {
            return 'VINYL';
        }

        if (
            availability.vinylSoldOut
        ) {
            return 'VINYL SOLD OUT';
        }

        if (
            availability.digital
        ) {
            return 'DIGITAL ONLY';
        }

        return 'BANDCAMP';
    }

    // ============================================================
    // MINI PLAYER POSITION
    // ============================================================

    function validPoint(
        point
    ) {
        return (
            point &&
            Number.isFinite(
                point.x
            ) &&
            Number.isFinite(
                point.y
            )
        );
    }

    function clampPoint(
        x,
        y,
        width,
        height
    ) {
        const margin =
            8;

        return {
            x:
                Math.min(
                    Math.max(
                        margin,
                        x
                    ),

                    Math.max(
                        margin,
                        window.innerWidth -
                            width -
                            margin
                    )
                ),

            y:
                Math.min(
                    Math.max(
                        margin,
                        y
                    ),

                    Math.max(
                        margin,
                        window.innerHeight -
                            height -
                            margin
                    )
                )
        };
    }

    function getSavedAnchor() {
        const value =
            GM_getValue(
                MINI_ANCHOR_KEY,
                null
            );

        return validPoint(
            value
        )
            ? value
            : null;
    }

    function saveAnchor(
        point
    ) {
        GM_setValue(
            MINI_ANCHOR_KEY,
            point
        );
    }

    function migrateMiniForIntegratedFavourite() {
        if (
            GM_getValue(
                MINI_FAVOURITE_INTEGRATION_KEY,
                false
            )
        ) {
            return;
        }

        const saved =
            getSavedAnchor();

        if (saved) {
            saveAnchor(
                clampPoint(
                    saved.x -
                        40,
                    saved.y,
                    MINI_WIDTH,
                    MINI_HEIGHT
                )
            );
        }

        GM_setValue(
            MINI_FAVOURITE_INTEGRATION_KEY,
            true
        );
    }

    function getSavedPanelAnchor() {
        const value =
            GM_getValue(
                PANEL_ANCHOR_KEY,
                null
            );

        return validPoint(
            value
        )
            ? value
            : null;
    }

    function savePanelAnchor(
        point
    ) {
        GM_setValue(
            PANEL_ANCHOR_KEY,
            point
        );
    }


    function validPanelSize(
        value
    ) {
        return (
            value &&
            Number.isFinite(
                value.width
            ) &&
            Number.isFinite(
                value.height
            ) &&
            value.width >
                0 &&
            value.height >
                0
        );
    }

    function getSavedPanelSize() {
        const value =
            GM_getValue(
                PANEL_SIZE_KEY,
                null
            );

        return validPanelSize(
            value
        )
            ? value
            : null;
    }

    function savePanelSize(
        size
    ) {
        /*
            v8.5.96: if the panel reaches the bottom of the window when it
            is saved, remember that, so it keeps filling down to the bottom
            on every page and window size instead of a fixed height.
        */

        const panel =
            document.getElementById(
                'strata-panel'
            );

        const rect =
            panel?.getBoundingClientRect();

        GM_setValue(
            PANEL_SIZE_KEY,
            {
                ...size,
                toBottom:
                    Boolean(
                        rect &&
                        rect.height > 0 &&
                        rect.bottom >=
                            window.innerHeight -
                            24
                    )
            }
        );
    }

    function clampPanelSize(
        width,
        height,
        anchor = null
    ) {
        const point =
            anchor ||
            getSavedPanelAnchor() ||
            {
                x: 8,
                y: 8
            };

        const margin =
            8;

        const maxWidth =
            Math.max(
                PANEL_MIN_WIDTH,
                window.innerWidth -
                    point.x -
                    margin
            );

        const maxHeight =
            Math.max(
                PANEL_MIN_HEIGHT,
                window.innerHeight -
                    point.y -
                    margin
            );

        return {
            width:
                Math.min(
                    Math.max(
                        PANEL_MIN_WIDTH,
                        width
                    ),
                    maxWidth
                ),

            height:
                Math.min(
                    Math.max(
                        PANEL_MIN_HEIGHT,
                        height
                    ),
                    maxHeight
                )
        };
    }

    function applySavedPanelSize() {
        const panel =
            document.getElementById(
                'strata-panel'
            );

        if (!panel) {
            return;
        }

        const saved =
            getSavedPanelSize();

        if (!saved) {
            panel.style.width =
                '';

            panel.style.height =
                '';

            return;
        }

        const size =
            clampPanelSize(
                saved.width,
                saved.toBottom
                    ? Number.MAX_SAFE_INTEGER
                    : saved.height
            );

        panel.style.width =
            `${size.width}px`;

        panel.style.height =
            `${size.height}px`;
    }

    function resetPanelSize() {
        /*
            v8.5.92: double-clicking the resize grip returns the panel to
            its docked home beside the player.
        */

        GM_setValue(
            PANEL_ANCHOR_KEY,
            null
        );

        setPanelDocked(
            true
        );

        GM_setValue(
            PANEL_SIZE_KEY,
            null
        );

        const panel =
            document.getElementById(
                'strata-panel'
            );

        if (!panel) {
            return;
        }

        panel.style.width =
            '';

        panel.style.height =
            '';

        requestAnimationFrame(
            () => {
                if (expanded) {
                    applyPanelPosition();
                    persistPanelPosition();
                }
            }
        );
    }


    /*
        HARD PANEL POSITION SNAPSHOT

        The visible top-left position of the expanded STRATA panel is
        authoritative. Save it immediately before YouTube navigation so
        SPA/full-page transitions cannot fall back to a default position.
    */

    function persistPanelPosition() {
        if (
            !expanded ||
            isPanelDocked()
        ) {
            return;
        }

        const root =
            document.getElementById(
                'strata-root'
            );

        const panel =
            document.getElementById(
                'strata-panel'
            );

        if (
            !root ||
            !panel
        ) {
            return;
        }

        const rootRect =
            root.getBoundingClientRect();

        const panelRect =
            panel.getBoundingClientRect();

        if (
            !Number.isFinite(
                rootRect.left
            ) ||
            !Number.isFinite(
                rootRect.top
            )
        ) {
            return;
        }

        const point =
            clampSavedPanelPoint(
                rootRect.left,
                rootRect.top,
                panelRect.width ||
                    PANEL_WIDTH
            );

        savePanelAnchor(
            point
        );
    }

    /*
        DEFAULT MINI POSITION

        Place STRATA inside the lower-right corner of the actual
        YouTube video player, just above the transport/progress area.

        This is only the DEFAULT/home position. The existing v8.5.2
        drag behaviour is untouched, so once the user drags STRATA
        somewhere else that position continues to be remembered.
    */

    function getVisiblePlayerRect() {
        const candidates = [
            document.querySelector(
                '#movie_player'
            ),

            document.querySelector(
                'ytd-player #movie_player'
            ),

            document.querySelector(
                'ytd-player'
            )
        ];

        for (
            const node
            of candidates
        ) {
            if (!node) {
                continue;
            }

            const rect =
                node.getBoundingClientRect();

            if (
                rect.width >
                    300 &&
                rect.height >
                    180 &&
                rect.bottom >
                    0 &&
                rect.right >
                    0
            ) {
                return rect;
            }
        }

        return null;
    }

    function getMastheadRect() {
        const candidates = [
            document.querySelector(
                '#masthead-container'
            ),
            document.querySelector(
                'ytd-masthead'
            ),
            document.querySelector(
                '#masthead'
            )
        ];

        for (
            const node
            of candidates
        ) {
            if (!node) {
                continue;
            }

            const rect =
                node.getBoundingClientRect();

            if (
                rect.width > 200 &&
                rect.height > 20
            ) {
                return rect;
            }
        }

        return null;
    }

    function findDefaultAnchor() {
        /*
            v8.5.92 home: top-left of the page, vertically centred in
            YouTube's top bar, sitting over the menu button and logo.
            Works the same on every page type and screen size.
        */

        const mastheadRect =
            getMastheadRect();

        const barTop =
            mastheadRect
                ? Math.max(
                    0,
                    mastheadRect.top
                )
                : 0;

        const barHeight =
            mastheadRect
                ? mastheadRect.height
                : 56;

        return clampPoint(
            8,
            barTop +
                (
                    barHeight -
                    MINI_HEIGHT
                ) /
                    2,
            MINI_WIDTH,
            MINI_HEIGHT
        );
    }

    function findLegacyPlayerCornerAnchor() {
        const playerRect =
            getVisiblePlayerRect();

        if (playerRect) {
            const rightInset =
                14;

            /*
                Keep the mini player above YouTube's progress line
                and bottom control strip, matching the reference
                placement rather than sitting on top of the controls.
            */

            const bottomControlClearance =
                56;

            return clampPoint(
                playerRect.right -
                    MINI_WIDTH -
                    rightInset,

                playerRect.bottom -
                    MINI_HEIGHT -
                    bottomControlClearance,

                MINI_WIDTH,
                MINI_HEIGHT
            );
        }

        /*
            Fallback only if YouTube has not rendered the player yet.
        */

        return clampPoint(
            window.innerWidth -
                MINI_WIDTH -
                24,

            window.innerHeight *
                0.72,

            MINI_WIDTH,
            MINI_HEIGHT
        );
    }

    function migrateMiniPlacementIfNeeded(
        attempt = 0
    ) {
        const savedVersion =
            Number(
                GM_getValue(
                    MINI_PLACEMENT_VERSION_KEY,
                    0
                )
            ) ||
            0;

        const needsPlacement =
            !getSavedAnchor() ||
            savedVersion <
                MINI_PLACEMENT_VERSION;

        if (!needsPlacement) {
            /*
                The mini and expanded panel share #strata-root.
                Never let mini positioning overwrite the user's
                saved big-panel position while STRATA is expanded.
            */
            if (!expanded) {
                applyMiniPosition();
            }

            return;
        }

        /*
            YouTube can finish sizing the video a little later than
            DOMContentLoaded. Retry briefly so the one-time migration
            uses the actual player rather than a guessed screen point.
        */

        if (
            !getMastheadRect() &&
            attempt <
                5
        ) {
            setTimeout(
                () =>
                    migrateMiniPlacementIfNeeded(
                        attempt +
                            1
                    ),
                500
            );

            return;
        }

        saveAnchor(
            findDefaultAnchor()
        );

        GM_setValue(
            MINI_PLACEMENT_VERSION_KEY,
            MINI_PLACEMENT_VERSION
        );

        if (!expanded) {
            applyMiniPosition();
        }
    }

    function getAnchor() {
        const saved =
            getSavedAnchor();

        if (saved) {
            return clampPoint(
                saved.x,
                saved.y,
                MINI_WIDTH,
                MINI_HEIGHT
            );
        }

        const fresh =
            findDefaultAnchor();

        saveAnchor(
            fresh
        );

        return fresh;
    }

    function applyMiniPosition() {
        const root =
            document.getElementById(
                'strata-root'
            );

        if (!root) {
            return;
        }

        /*
            Hard separation between the two saved positions.
            The collapsed mini player is never allowed to move the
            shared root while the large panel is currently visible.
        */
        if (expanded) {
            return;
        }

        const point =
            getAnchor();

        root.style.left =
            `${point.x}px`;

        root.style.top =
            `${point.y}px`;

        root.style.right =
            'auto';

        root.style.bottom =
            'auto';
    }

    function getPanelSize() {
        const panel =
            document.getElementById(
                'strata-panel'
            );

        const rect =
            panel
                ?.getBoundingClientRect();

        return {
            width:
                rect?.width ||
                PANEL_WIDTH,

            height:
                rect?.height ||
                520
        };
    }

    /*
        EXPANDED PANEL POSITION

        On a normal YouTube watch page, place the large STRATA panel
        over the suggested-videos column. This deliberately masks the
        recommendation feed while STRATA is open.

        If YouTube changes layout, theatre mode removes the sidebar,
        or the sidebar is not visible, fall back to the original
        v8.5.2-style anchor behaviour.
    */

    function getSuggestedColumnRect() {
        const candidates = [
            document.querySelector(
                'ytd-watch-flexy #secondary'
            ),

            document.querySelector(
                '#secondary'
            ),

            document.querySelector(
                '#secondary-inner'
            ),

            document.querySelector(
                'ytd-watch-next-secondary-results-renderer'
            )
        ];

        for (
            const node
            of candidates
        ) {
            if (!node) {
                continue;
            }

            const rect =
                node.getBoundingClientRect();

            if (
                rect.width >
                    250 &&
                rect.height >
                    120 &&
                rect.right >
                    0 &&
                rect.left <
                    window.innerWidth
            ) {
                return rect;
            }
        }

        return null;
    }

    function clampSavedPanelPoint(
        x,
        y,
        width
    ) {
        /*
            A dragged panel is locked by its TOP-LEFT position.

            Do not re-clamp Y using the panel's changing height: opening
            or closing Links / Channels / Stats used to make the panel
            jump because its measured height changed between videos.

            We only ensure that the header remains on-screen.
        */

        const margin =
            8;

        const visibleHeader =
            48;

        return {
            x:
                Math.min(
                    Math.max(
                        margin,
                        x
                    ),
                    Math.max(
                        margin,
                        window.innerWidth -
                            width -
                            margin
                    )
                ),

            y:
                Math.min(
                    Math.max(
                        margin,
                        y
                    ),
                    Math.max(
                        margin,
                        window.innerHeight -
                            visibleHeader
                    )
                )
        };
    }

    function isPanelDocked() {
        return GM_getValue(
            PANEL_DOCKED_KEY,
            true
        ) !== false;
    }

    function setPanelDocked(
        docked
    ) {
        GM_setValue(
            PANEL_DOCKED_KEY,
            Boolean(
                docked
            )
        );
    }

    function migratePanelPlacementIfNeeded() {
        const savedVersion =
            Number(
                GM_getValue(
                    PANEL_PLACEMENT_VERSION_KEY,
                    0
                )
            ) ||
            0;

        if (
            savedVersion >=
            PANEL_PLACEMENT_VERSION
        ) {
            return;
        }

        GM_setValue(
            PANEL_ANCHOR_KEY,
            null
        );

        GM_setValue(
            PANEL_SIZE_KEY,
            null
        );

        setPanelDocked(
            true
        );

        GM_setValue(
            PANEL_PLACEMENT_VERSION_KEY,
            PANEL_PLACEMENT_VERSION
        );
    }

    function getDockPlayerRect() {
        /*
            Unlike getVisiblePlayerRect(), scrolling the page does not
            matter here: only the player's right edge is used, and that
            does not move when the page scrolls.
        */

        const candidates = [
            document.querySelector(
                'ytd-watch-flexy #movie_player'
            ),
            document.querySelector(
                '#movie_player'
            ),
            document.querySelector(
                'ytd-player'
            )
        ];

        for (
            const node
            of candidates
        ) {
            if (!node) {
                continue;
            }

            const rect =
                node.getBoundingClientRect();

            if (
                rect.width > 300 &&
                rect.height > 150
            ) {
                return rect;
            }
        }

        return null;
    }

    function getDockedPanelGeometry() {
        if (
            document.fullscreenElement
        ) {
            return null;
        }

        const playerRect =
            getDockPlayerRect();

        if (!playerRect) {
            return null;
        }

        const margin =
            8;

        const viewportWidth =
            document.documentElement
                .clientWidth ||
            window.innerWidth;

        const viewportHeight =
            window.innerHeight;

        const x =
            Math.round(
                playerRect.right +
                PANEL_DOCK_GAP
            );

        const width =
            Math.floor(
                viewportWidth -
                x -
                margin
            );

        /*
            Not enough room beside the player (theatre mode, narrow
            window): fall back to the normal placement.
        */

        if (
            width <
            PANEL_MIN_WIDTH
        ) {
            return null;
        }

        return {
            x,
            y:
                margin,
            width,
            height:
                Math.max(
                    PANEL_MIN_HEIGHT,
                    Math.floor(
                        viewportHeight -
                        margin *
                            2
                    )
                )
        };
    }

    let panelDockObserver =
        null;

    let panelDockObservedNode =
        null;

    let panelDockFrame =
        0;

    let panelDockLastApplied =
        false;

    function watchPlayerForDocking() {
        if (
            typeof ResizeObserver !==
                'function'
        ) {
            return;
        }

        const node =
            document.querySelector(
                '#movie_player'
            );

        if (
            !node ||
            node ===
                panelDockObservedNode
        ) {
            return;
        }

        if (!panelDockObserver) {
            panelDockObserver =
                new ResizeObserver(
                    () => {
                        if (
                            panelDockFrame
                        ) {
                            return;
                        }

                        panelDockFrame =
                            requestAnimationFrame(
                                () => {
                                    panelDockFrame =
                                        0;

                                    if (
                                        expanded &&
                                        isPanelDocked()
                                    ) {
                                        applyPanelPosition();
                                    }
                                }
                            );
                    }
                );
        }

        panelDockObserver.disconnect();

        panelDockObserver.observe(
            node
        );

        panelDockObservedNode =
            node;
    }

    function calculatePanelPosition() {
        const size =
            getPanelSize();

        if (
            isPanelDocked()
        ) {
            const docked =
                getDockedPanelGeometry();

            if (docked) {
                return {
                    x:
                        docked.x,
                    y:
                        docked.y
                };
            }
        }

        /*
            A manually placed panel always wins. Its top-left position
            stays fixed even when the panel's internal sections change
            height or a new YouTube video loads.
        */

        const savedPanelAnchor =
            getSavedPanelAnchor();

        if (savedPanelAnchor) {
            return clampSavedPanelPoint(
                savedPanelAnchor.x,
                savedPanelAnchor.y,
                size.width
            );
        }

        const suggestedRect =
            getSuggestedColumnRect();

        if (suggestedRect) {
            /*
                Centre STRATA across the recommendation column.
                A small top offset leaves YouTube's topic chips visible
                while the recommendation thumbnails themselves are
                largely covered, matching the supplied reference.
            */

            const x =
                suggestedRect.left +
                (
                    suggestedRect.width -
                    size.width
                ) /
                    2;

            const y =
                suggestedRect.top +
                100;

            return clampPoint(
                x,
                y,
                size.width,
                size.height
            );
        }

        /*
            Safe fallback: original anchored expansion behaviour.
        */

        const anchor =
            getAnchor();

        const gap =
            10;

        let x =
            anchor.x +
            4;

        let y =
            anchor.y -
            size.height -
            gap;

        if (
            x +
                size.width >
            window.innerWidth -
                8
        ) {
            x =
                anchor.x +
                MINI_WIDTH -
                size.width;
        }

        if (
            y <
            8
        ) {
            y =
                anchor.y +
                MINI_HEIGHT +
                gap;
        }

        return clampPoint(
            x,
            y,
            size.width,
            size.height
        );
    }

    function applyPanelPosition() {
        const root =
            document.getElementById(
                'strata-root'
            );

        if (!root) {
            return;
        }

        if (
            isPanelDocked()
        ) {
            watchPlayerForDocking();

            const panel =
                document.getElementById(
                    'strata-panel'
                );

            const docked =
                getDockedPanelGeometry();

            panelDockLastApplied =
                Boolean(
                    docked
                );

            if (panel) {
                if (docked) {
                    panel.style.width =
                        `${docked.width}px`;

                    panel.style.height =
                        `${docked.height}px`;

                } else if (
                    !getSavedPanelSize()
                ) {
                    panel.style.width =
                        '';

                    panel.style.height =
                        '';
                }
            }
        }

        const point =
            calculatePanelPosition();

        root.style.left =
            `${point.x}px`;

        root.style.top =
            `${point.y}px`;

        root.style.right =
            'auto';

        root.style.bottom =
            'auto';
    }

    function setExpanded(
        next,
        persist = true
    ) {
        expanded =
            Boolean(
                next
            );

        if (persist) {
            GM_setValue(
                PANEL_EXPANDED_KEY,
                expanded
            );
        }

        const root =
            document.getElementById(
                'strata-root'
            );

        if (!root) {
            return;
        }

        root.classList.toggle(
            'expanded',
            expanded
        );

        applyVisualizerVisibility();

        requestAnimationFrame(
            () => {
                if (expanded) {
                    applyPanelPosition();

                } else {
                    applyMiniPosition();
                }
            }
        );
    }

    // ============================================================
    // DRAGGING
    //
    // This is deliberately simple:
    //
    // pointerdown -> DO NOTHING destructive
    //
    // if movement > 5 px -> it becomes a drag
    //
    // if movement never exceeds 5 px -> normal click survives
    //
    // No pointer capture before drag detection.
    // No preventDefault before drag detection.
    // ============================================================

    function installMiniDragging(
        root,
        mini
    ) {
        mini.addEventListener(
            'pointerdown',

            downEvent => {
                if (
                    downEvent.button !==
                        0 ||
                    expanded
                ) {
                    return;
                }

                /*
                    The edge controls do not participate in drag
                    detection. The centre STRATA segment remains the
                    drag/open surface exactly as before.
                */

                if (
                    downEvent.target.closest(
                        '#strata-mini-next, #strata-mini-favourite'
                    )
                ) {
                    return;
                }

                const startRect =
                    root.getBoundingClientRect();

                const startX =
                    downEvent.clientX;

                const startY =
                    downEvent.clientY;

                const originX =
                    startRect.left;

                const originY =
                    startRect.top;

                let dragging =
                    false;

                const pointerId =
                    downEvent.pointerId;

                function onMove(
                    moveEvent
                ) {
                    if (
                        moveEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    const dx =
                        moveEvent.clientX -
                        startX;

                    const dy =
                        moveEvent.clientY -
                        startY;

                    /*
                        Until this threshold is crossed,
                        this is still potentially a normal click.
                    */

                    if (
                        !dragging &&
                        Math.hypot(
                            dx,
                            dy
                        ) <
                            5
                    ) {
                        return;
                    }

                    if (!dragging) {
                        dragging =
                            true;

                        mini.classList.add(
                            'dragging'
                        );

                        document.documentElement
                            .classList
                            .add(
                                'strata-is-dragging'
                            );
                    }

                    moveEvent.preventDefault();

                    const point =
                        clampPoint(
                            originX +
                                dx,

                            originY +
                                dy,

                            MINI_WIDTH,
                            MINI_HEIGHT
                        );

                    root.style.left =
                        `${point.x}px`;

                    root.style.top =
                        `${point.y}px`;

                    root.style.right =
                        'auto';

                    root.style.bottom =
                        'auto';
                }

                function finish(
                    upEvent
                ) {
                    if (
                        upEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    window.removeEventListener(
                        'pointermove',
                        onMove
                    );

                    window.removeEventListener(
                        'pointerup',
                        finish
                    );

                    window.removeEventListener(
                        'pointercancel',
                        finish
                    );

                    mini.classList.remove(
                        'dragging'
                    );

                    document.documentElement
                        .classList
                        .remove(
                            'strata-is-dragging'
                        );

                    if (!dragging) {
                        /*
                            Leave everything alone.

                            Browser generates the ordinary
                            click on #strata-mini-brand.
                        */

                        return;
                    }

                    const rect =
                        root.getBoundingClientRect();

                    const point =
                        clampPoint(
                            rect.left,
                            rect.top,
                            MINI_WIDTH,
                            MINI_HEIGHT
                        );

                    saveAnchor(
                        point
                    );

                    applyMiniPosition();

                    /*
                        The browser may still manufacture a click
                        after the drag. Suppress it briefly.
                    */

                    suppressMiniClickUntil =
                        performance.now() +
                        350;
                }

                window.addEventListener(
                    'pointermove',
                    onMove,
                    {
                        passive:
                            false
                    }
                );

                window.addEventListener(
                    'pointerup',
                    finish
                );

                window.addEventListener(
                    'pointercancel',
                    finish
                );
            }
        );
    }


    // ============================================================
    // BIG PANEL WHEEL ISOLATION
    //
    // While the pointer is over expanded STRATA, the mouse wheel belongs
    // to STRATA. If an internal scroller can move, let the browser scroll
    // it normally. If no STRATA scrollbar can consume that movement, block
    // the wheel so YouTube behind the panel does not move.
    //
    // This also prevents scroll-chaining when an internal list or the panel
    // itself reaches its top/bottom edge.
    // ============================================================

    function installPanelWheelIsolation(
        panel
    ) {
        panel.addEventListener(
            'wheel',

            event => {
                if (!expanded) {
                    return;
                }

                /*
                    Do not let YouTube receive wheel listeners while STRATA
                    is under the pointer. Default scrolling is still allowed
                    below when a STRATA scroll container can consume it.
                */

                event.stopPropagation();

                const deltaY =
                    event.deltaY;

                if (
                    !Number.isFinite(
                        deltaY
                    ) ||
                    deltaY ===
                        0
                ) {
                    event.preventDefault();
                    return;
                }

                const movingDown =
                    deltaY >
                    0;

                let node =
                    event.target instanceof
                        Element
                        ? event.target
                        : panel;

                while (node) {
                    const style =
                        getComputedStyle(
                            node
                        );

                    const overflowY =
                        style.overflowY;

                    const scrollable =
                        (
                            overflowY ===
                                'auto' ||
                            overflowY ===
                                'scroll' ||
                            overflowY ===
                                'overlay'
                        ) &&
                        node.scrollHeight >
                            node.clientHeight +
                                1;

                    if (scrollable) {
                        const maxScrollTop =
                            Math.max(
                                0,
                                node.scrollHeight -
                                    node.clientHeight
                            );

                        const canMove =
                            movingDown
                                ? node.scrollTop <
                                    maxScrollTop -
                                        1
                                : node.scrollTop >
                                    1;

                        if (canMove) {
                            /*
                                Let the browser perform its ordinary scroll
                                inside STRATA. Propagation is already stopped,
                                so YouTube cannot react to the same wheel event.
                            */

                            return;
                        }
                    }

                    if (
                        node ===
                        panel
                    ) {
                        break;
                    }

                    node =
                        node.parentElement;

                    if (
                        node &&
                        !panel.contains(
                            node
                        )
                    ) {
                        break;
                    }
                }

                /*
                    No STRATA scroll container can move in this direction.
                    Swallow the wheel instead of allowing page scroll-chaining.
                */

                event.preventDefault();
            },

            {
                passive:
                    false
            }
        );
    }


    // ============================================================
    // BIG PANEL DRAGGING
    //
    // The header is the drag handle. Interactive controls elsewhere
    // in the panel remain completely untouched.
    //
    // The expanded panel has its own saved X/Y position and does not
    // change the mini player's saved home position.
    // ============================================================

    function installPanelDragging(
        root,
        panel,
        header
    ) {
        header.addEventListener(
            'pointerdown',

            downEvent => {
                if (
                    downEvent.button !==
                        0 ||
                    !expanded
                ) {
                    return;
                }

                /*
                    The collapse button stays an ordinary button and
                    never starts a drag.
                */

                if (
                    downEvent.target.closest(
                        '#strata-close'
                    )
                ) {
                    return;
                }

                const startRect =
                    root.getBoundingClientRect();

                const panelSize =
                    getPanelSize();

                const startX =
                    downEvent.clientX;

                const startY =
                    downEvent.clientY;

                const originX =
                    startRect.left;

                const originY =
                    startRect.top;

                let dragging =
                    false;

                const pointerId =
                    downEvent.pointerId;

                function onMove(
                    moveEvent
                ) {
                    if (
                        moveEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    const dx =
                        moveEvent.clientX -
                        startX;

                    const dy =
                        moveEvent.clientY -
                        startY;

                    if (
                        !dragging &&
                        Math.hypot(
                            dx,
                            dy
                        ) <
                            5
                    ) {
                        return;
                    }

                    if (!dragging) {
                        dragging =
                            true;

                        panel.classList.add(
                            'dragging'
                        );

                        document.documentElement
                            .classList
                            .add(
                                'strata-is-dragging'
                            );
                    }

                    moveEvent.preventDefault();

                    const point =
                        clampSavedPanelPoint(
                            originX +
                                dx,

                            originY +
                                dy,

                            panelSize.width
                        );

                    root.style.left =
                        `${point.x}px`;

                    root.style.top =
                        `${point.y}px`;

                    root.style.right =
                        'auto';

                    root.style.bottom =
                        'auto';
                }

                function finish(
                    upEvent
                ) {
                    if (
                        upEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    window.removeEventListener(
                        'pointermove',
                        onMove
                    );

                    window.removeEventListener(
                        'pointerup',
                        finish
                    );

                    window.removeEventListener(
                        'pointercancel',
                        finish
                    );

                    panel.classList.remove(
                        'dragging'
                    );

                    document.documentElement
                        .classList
                        .remove(
                            'strata-is-dragging'
                        );

                    if (!dragging) {
                        return;
                    }

                    const rect =
                        root.getBoundingClientRect();

                    const size =
                        getPanelSize();

                    const point =
                        clampSavedPanelPoint(
                            rect.left,
                            rect.top,
                            size.width
                        );

                    if (
                        isPanelDocked()
                    ) {
                        /*
                            Keep the docked size the user was looking at
                            so undocking does not suddenly shrink it.
                        */

                        const panelRect =
                            panel.getBoundingClientRect();

                        savePanelSize({
                            width:
                                panelRect.width,
                            height:
                                panelRect.height
                        });

                        setPanelDocked(
                            false
                        );
                    }

                    savePanelAnchor(
                        point
                    );

                    applyPanelPosition();
                }

                window.addEventListener(
                    'pointermove',
                    onMove,
                    {
                        passive:
                            false
                    }
                );

                window.addEventListener(
                    'pointerup',
                    finish
                );

                window.addEventListener(
                    'pointercancel',
                    finish
                );
            }
        );
    }

    // ============================================================
    // BIG PANEL RESIZING
    //
    // Bottom-right grip changes width/height only. The top-left
    // anchor never moves, so the user's panel placement remains
    // exactly where they put it.
    // ============================================================

    function installPanelResizing(
        root,
        panel,
        grip
    ) {
        grip.addEventListener(
            'pointerdown',

            downEvent => {
                if (
                    downEvent.button !==
                        0 ||
                    !expanded
                ) {
                    return;
                }

                downEvent.preventDefault();
                downEvent.stopPropagation();

                const rootRect =
                    root.getBoundingClientRect();

                const panelRect =
                    panel.getBoundingClientRect();

                const startX =
                    downEvent.clientX;

                const startY =
                    downEvent.clientY;

                const startWidth =
                    panelRect.width;

                const startHeight =
                    panelRect.height;

                const anchor = {
                    x:
                        rootRect.left,
                    y:
                        rootRect.top
                };

                const pointerId =
                    downEvent.pointerId;

                panel.classList.add(
                    'resizing'
                );

                document.documentElement
                    .classList
                    .add(
                        'strata-is-resizing'
                    );

                function onMove(
                    moveEvent
                ) {
                    if (
                        moveEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    moveEvent.preventDefault();

                    const size =
                        clampPanelSize(
                            startWidth +
                                moveEvent.clientX -
                                startX,

                            startHeight +
                                moveEvent.clientY -
                                startY,

                            anchor
                        );

                    panel.style.width =
                        `${size.width}px`;

                    panel.style.height =
                        `${size.height}px`;

                    root.style.left =
                        `${anchor.x}px`;

                    root.style.top =
                        `${anchor.y}px`;

                    root.style.right =
                        'auto';

                    root.style.bottom =
                        'auto';
                }

                function finish(
                    upEvent
                ) {
                    if (
                        upEvent.pointerId !==
                        pointerId
                    ) {
                        return;
                    }

                    window.removeEventListener(
                        'pointermove',
                        onMove
                    );

                    window.removeEventListener(
                        'pointerup',
                        finish
                    );

                    window.removeEventListener(
                        'pointercancel',
                        finish
                    );

                    panel.classList.remove(
                        'resizing'
                    );

                    document.documentElement
                        .classList
                        .remove(
                            'strata-is-resizing'
                        );

                    const rect =
                        panel.getBoundingClientRect();

                    setPanelDocked(
                        false
                    );

                    savePanelSize({
                        width:
                            rect.width,
                        height:
                            rect.height
                    });

                    savePanelAnchor({
                        x:
                            anchor.x,
                        y:
                            anchor.y
                    });
                }

                window.addEventListener(
                    'pointermove',
                    onMove,
                    {
                        passive:
                            false
                    }
                );

                window.addEventListener(
                    'pointerup',
                    finish
                );

                window.addEventListener(
                    'pointercancel',
                    finish
                );
            }
        );

        grip.addEventListener(
            'dblclick',

            event => {
                event.preventDefault();
                event.stopPropagation();
                resetPanelSize();
            }
        );
    }


    // ============================================================
    // DOM HELPERS
    // ============================================================

    function el(
        tag,
        options = {}
    ) {
        const node =
            document.createElement(
                tag
            );

        if (
            options.id
        ) {
            node.id =
                options.id;
        }

        if (
            options.className
        ) {
            node.className =
                options.className;
        }

        if (
            options.text !==
            undefined
        ) {
            node.textContent =
                options.text;
        }

        if (
            options.title
        ) {
            node.title =
                options.title;
        }

        return node;
    }

    function btn(
        id,
        text,
        title =
            ''
    ) {
        const node =
            document.createElement(
                'button'
            );

        if (id) {
            node.id =
                id;
        }

        node.type =
            'button';

        node.textContent =
            text;

        node.title =
            title;

        return node;
    }

    // ============================================================
    // UI
    // ============================================================

    function togglePlayback() {
        const video =
            currentMainVideo();

        if (!video) {
            return;
        }

        if (video.paused) {
            const result =
                video.play();

            if (
                result &&
                typeof result.catch ===
                    'function'
            ) {
                result.catch(
                    () => {}
                );
            }

        } else {
            video.pause();
        }

        updatePlayPauseUI();
    }

    function updatePlayPauseUI() {
        const button =
            document.getElementById(
                'strata-play'
            );

        if (!button) {
            return;
        }

        const video =
            currentMainVideo();

        const paused =
            !video ||
            video.paused;

        button.textContent =
            paused
                ? '▶'
                : 'Ⅱ';

        button.title =
            paused
                ? 'Play'
                : 'Pause';

        button.setAttribute(
            'aria-label',
            button.title
        );
    }

    function persistPanelSectionState() {
        const snapshot = {
            linksOpen:
                Boolean(
                    linksOpen
                ),

            channelsOpen:
                Boolean(
                    channelsOpen
                ),

            utilityPanelOpen:
                utilityPanelOpen ||
                null
        };

        GM_setValue(
            PANEL_UI_STATE_KEY,
            snapshot
        );

        /*
            Keep the older keys in sync too, so rolling back to v8.5.11
            does not lose the user's preferred panel layout.
        */

        GM_setValue(
            LINKS_OPEN_KEY,
            snapshot.linksOpen
        );

        GM_setValue(
            CHANNELS_OPEN_KEY,
            snapshot.channelsOpen
        );

        GM_setValue(
            UTILITY_PANEL_KEY,
            snapshot.utilityPanelOpen
        );
    }

    function restorePanelSectionState() {
        const snapshot =
            GM_getValue(
                PANEL_UI_STATE_KEY,
                null
            );

        if (
            !snapshot ||
            typeof snapshot !==
                'object'
        ) {
            return;
        }

        linksOpen =
            Boolean(
                snapshot.linksOpen
            );

        channelsOpen =
            Boolean(
                snapshot.channelsOpen
            );

        utilityPanelOpen =
            [
                'library',
                'stats',
                'settings',
                'about'
            ].includes(
                snapshot.utilityPanelOpen
            )
                ? snapshot.utilityPanelOpen
                : null;
    }

    function applyPanelSectionStateToUI() {
        const linksBody =
            document.getElementById(
                'strata-links-body'
            );

        const linksChevron =
            document.getElementById(
                'strata-links-chevron'
            );

        const channelManager =
            document.getElementById(
                'strata-channel-manager'
            );

        const channelChevron =
            document.getElementById(
                'strata-channel-chevron'
            );

        const utilityPanel =
            document.getElementById(
                'strata-utility-panel'
            );

        if (linksBody) {
            linksBody.classList.toggle(
                'open',
                linksOpen
            );
        }

        if (linksChevron) {
            linksChevron.textContent =
                linksOpen
                    ? '⌃'
                    : '⌄';
        }

        if (channelManager) {
            channelManager.classList.toggle(
                'open',
                channelsOpen
            );
        }

        if (channelChevron) {
            channelChevron.textContent =
                channelsOpen
                    ? '⌃'
                    : '⌄';
        }

        if (utilityPanel) {
            utilityPanel.classList.toggle(
                'open',
                Boolean(
                    utilityPanelOpen
                )
            );
        }

        for (
            const tab
            of document.querySelectorAll(
                '.strata-footer-tab'
            )
        ) {
            tab.classList.toggle(
                'active',
                tab.dataset.panel ===
                    utilityPanelOpen
            );
        }

        if (utilityPanelOpen) {
            renderUtilityPanel();
        }

        applyVisualizerVisibility();
    }

    function setUtilityPanel(
        name
    ) {
        utilityPanelOpen =
            utilityPanelOpen ===
                name
                ? null
                : name;

        persistPanelSectionState();

        const panel =
            document.getElementById(
                'strata-utility-panel'
            );

        if (panel) {
            panel.classList.toggle(
                'open',
                Boolean(
                    utilityPanelOpen
                )
            );
        }

        for (
            const tab
            of document.querySelectorAll(
                '.strata-footer-tab'
            )
        ) {
            tab.classList.toggle(
                'active',
                tab.dataset.panel ===
                    utilityPanelOpen
            );
        }

        renderUtilityPanel();

        applyVisualizerVisibility();

        requestAnimationFrame(
            () => {
                if (expanded) {
                    applyPanelPosition();
                }
            }
        );
    }

    function formatStatsPercent(
        numerator,
        denominator
    ) {
        const top =
            Number(
                numerator
            ) ||
            0;

        const bottom =
            Number(
                denominator
            ) ||
            0;

        if (
            bottom <=
            0
        ) {
            return '0%';
        }

        const value =
            (
                top /
                bottom
            ) *
            100;

        if (
            value >
                0 &&
            value <
                0.01
        ) {
            return '<0.01%';
        }

        if (
            value <
            1
        ) {
            return `${value.toFixed(2)}%`;
        }

        if (
            value <
            10
        ) {
            return `${value.toFixed(1)}%`;
        }

        return `${Math.round(value)}%`;
    }

    function buildStatsSnapshot() {
        const enabledHandles =
            getEnabledChannels();

        const enabledSet =
            new Set(
                enabledHandles
            );

        const seen =
            getSeen();

        const activeIds =
            new Set();

        const bucketRows =
            BUCKETS.map(
                bucket => ({
                    id:
                        bucket.id,

                    label:
                        bucket.label,

                    ids:
                        new Set()
                })
            );

        const bucketById =
            new Map(
                bucketRows.map(
                    row => [
                        row.id,
                        row
                    ]
                )
            );

        const channelRows =
            [];

        for (
            const channel
            of channelSettings
        ) {
            const channelIds =
                new Set();

            let played =
                0;

            for (
                const bucket
                of BUCKETS
            ) {
                const bucketVideos =
                    ensureBucket(
                        channel.handle,
                        bucket
                    ).videos;

                for (
                    const video
                    of bucketVideos
                ) {
                    if (
                        !video?.videoId
                    ) {
                        continue;
                    }

                    channelIds.add(
                        video.videoId
                    );

                    if (
                        channel.enabled
                    ) {
                        activeIds.add(
                            video.videoId
                        );

                        bucketById
                            .get(
                                bucket.id
                            )
                            ?.ids
                            .add(
                                video.videoId
                            );
                    }
                }
            }

            for (
                const id
                of channelIds
            ) {
                if (
                    seen.has(
                        id
                    )
                ) {
                    played++;
                }
            }

            channelRows.push({
                handle:
                    channel.handle,

                enabled:
                    Boolean(
                        channel.enabled
                    ),

                total:
                    channelIds.size,

                played
            });
        }

        let playedActive =
            0;

        for (
            const id
            of seen
        ) {
            if (
                activeIds.has(
                    id
                )
            ) {
                playedActive++;
            }
        }

        const activeTotal =
            activeIds.size;

        const remaining =
            Math.max(
                0,
                activeTotal -
                    playedActive
            );

        return {
            masterTotal:
                getLocalLibraryTotal(),

            activeTotal,

            enabledChannels:
                enabledHandles.length,

            totalChannels:
                channelSettings.length,

            playedActive,

            remaining,

            coverage:
                formatStatsPercent(
                    playedActive,
                    activeTotal
                ),

            favourites:
                getFavouriteTracksSorted()
                    .length,

            buckets:
                bucketRows.map(
                    row => ({
                        id:
                            row.id,

                        label:
                            row.label,

                        total:
                            row.ids.size
                    })
                ),

            channels:
                channelRows
        };
    }

    function renderUtilityPanel() {
        const title =
            document.getElementById(
                'strata-utility-title'
            );

        const body =
            document.getElementById(
                'strata-utility-body'
            );

        if (
            !title ||
            !body ||
            !utilityPanelOpen
        ) {
            return;
        }

        body.replaceChildren();

        const total =
            getUniqueTotal();

        const savedTracks =
            getFavouriteTracksSorted();

        const favouritesPlaylist =
            syncFavouritesPlaylistToCurrent();

        function utilityNote(
            text
        ) {
            return el(
                'div',
                {
                    className:
                        'strata-utility-note',

                    text
                }
            );
        }

        function metric(
            label,
            value
        ) {
            const card =
                el(
                    'div',
                    {
                        className:
                            'strata-metric-card'
                    }
                );

            card.append(
                el(
                    'div',
                    {
                        className:
                            'strata-metric-value',

                        text:
                            String(
                                value
                            )
                    }
                ),

                el(
                    'div',
                    {
                        className:
                            'strata-metric-label',

                        text:
                            label
                    }
                )
            );

            return card;
        }

        if (
            utilityPanelOpen ===
            'library'
        ) {
            title.textContent =
                'LIBRARY';

            body.append(
                utilityNote(
                    `${total.toLocaleString()} cached tracks · ${savedTracks.length.toLocaleString()} favourites`
                )
            );

            if (
                !savedTracks.length
            ) {
                body.append(
                    utilityNote(
                        'Favourite a track with the heart and it will appear here.'
                    )
                );

            } else {
                const actions =
                    el(
                        'div',
                        {
                            className:
                                'strata-library-actions'
                        }
                    );

                const playAll =
                    btn(
                        '',
                        '▶  PLAY ALL',
                        'Play all favourites'
                    );

                playAll.className =
                    'strata-library-action';

                const shuffle =
                    btn(
                        '',
                        '↝  SHUFFLE',
                        'Shuffle favourites'
                    );

                shuffle.className =
                    'strata-library-action';

                playAll.addEventListener(
                    'click',
                    () =>
                        startFavouritesPlaylist(
                            false
                        )
                );

                shuffle.addEventListener(
                    'click',
                    () =>
                        startFavouritesPlaylist(
                            true
                        )
                );

                actions.append(
                    playAll,
                    shuffle
                );

                body.appendChild(
                    actions
                );

                if (favouritesPlaylist) {
                    const playlistStatus =
                        el(
                            'div',
                            {
                                className:
                                    'strata-library-playlist-status'
                            }
                        );

                    const playlistCopy =
                        el(
                            'div',
                            {
                                className:
                                    'strata-library-playlist-copy'
                            }
                        );

                    const currentNumber =
                        Math.min(
                            favouritesPlaylist.index +
                                1,
                            favouritesPlaylist.queue.length
                        );

                    playlistCopy.append(
                        el(
                            'span',
                            {
                                className:
                                    'strata-library-playlist-title',

                                text:
                                    favouritesPlaylist.ended
                                        ? 'FAVOURITES PLAYLIST · END'
                                        : `FAVOURITES PLAYLIST · ${currentNumber}/${favouritesPlaylist.queue.length}`
                            }
                        ),

                        el(
                            'span',
                            {
                                className:
                                    'strata-library-playlist-sub',

                                text:
                                    favouritesPlaylist.shuffled
                                        ? 'SHUFFLED · MAIN PREV/NEXT FOLLOW THIS QUEUE'
                                        : 'MAIN PREV/NEXT FOLLOW THIS QUEUE'
                            }
                        )
                    );

                    const returnButton =
                        btn(
                            '',
                            'DISCOVERY',
                            'Return to normal STRATA discovery'
                        );

                    returnButton.className =
                        'strata-library-return';

                    returnButton.addEventListener(
                        'click',
                        exitFavouritesPlaylist
                    );

                    playlistStatus.append(
                        playlistCopy,
                        returnButton
                    );

                    body.appendChild(
                        playlistStatus
                    );
                }

                const list =
                    el(
                        'div',
                        {
                            className:
                                'strata-library-list'
                        }
                    );

                const playingFavouriteId =
                    favouritesPlaylist &&
                    favouritesPlaylist.queue[
                        favouritesPlaylist.index
                    ];

                for (
                    const track
                    of savedTracks
                ) {
                    const row =
                        btn(
                            '',
                            '',
                            'Play saved track'
                        );

                    row.className =
                        'strata-library-track';

                    if (
                        playingFavouriteId &&
                        track.videoId ===
                            playingFavouriteId
                    ) {
                        row.classList.add(
                            'playing'
                        );
                    }

                    row.append(
                        el(
                            'span',
                            {
                                className:
                                    'strata-library-track-copy'
                            }
                        )
                    );

                    const copy =
                        row.firstElementChild;

                    copy.append(
                        el(
                            'span',
                            {
                                className:
                                    'strata-library-track-title',

                                text:
                                    track.title ||
                                    'Saved track'
                            }
                        ),

                        el(
                            'span',
                            {
                                className:
                                    'strata-library-track-channel',

                                text:
                                    track.channelHandle ||
                                    ''
                            }
                        )
                    );

                    row.append(
                        el(
                            'span',
                            {
                                className:
                                    'strata-library-track-arrow',

                                text:
                                    '›'
                            }
                        )
                    );

                    row.addEventListener(
                        'click',
                        () => {
                            if (
                                track.videoId
                            ) {
                                /*
                                    Claim ownership so the track autostarts
                                    and RADIO continues after it ends.
                                */

                                markStrataNavigation(
                                    track.videoId
                                );

                                persistPanelSectionState();
                                persistPanelPosition();

                                strataNavigate(
                                    track.videoId
                                );
                            }
                        }
                    );

                    list.appendChild(
                        row
                    );
                }

                body.appendChild(
                    list
                );
            }

            return;
        }

        if (
            utilityPanelOpen ===
            'stats'
        ) {
            title.textContent =
                'STATS';

            const snapshot =
                buildStatsSnapshot();

            const hero =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-hero'
                    }
                );

            const heroMain =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-hero-main'
                    }
                );

            heroMain.append(
                el(
                    'div',
                    {
                        className:
                            'strata-stats-hero-value',

                        text:
                            snapshot.masterTotal.toLocaleString()
                    }
                ),

                el(
                    'div',
                    {
                        className:
                            'strata-stats-hero-label',

                        text:
                            'MASTER CATALOGUE'
                    }
                )
            );

            const channelPill =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-channel-pill',

                        text:
                            `${snapshot.enabledChannels}/${snapshot.totalChannels} CHANNELS ACTIVE`
                    }
                );

            hero.append(
                heroMain,
                channelPill
            );

            if (
                snapshot.activeTotal !==
                snapshot.masterTotal
            ) {
                hero.appendChild(
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-hero-sub',

                            text:
                                `${snapshot.activeTotal.toLocaleString()} tracks currently active`
                        }
                    )
                );
            }

            const sessionHeader =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-section-title',

                        text:
                            'SESSION'
                    }
                );

            const sessionGrid =
                el(
                    'div',
                    {
                        className:
                            'strata-metric-grid strata-stats-session-grid'
                    }
                );

            sessionGrid.append(
                metric(
                    'PLAYED',
                    snapshot.playedActive.toLocaleString()
                ),

                metric(
                    'UNPLAYED',
                    snapshot.remaining.toLocaleString()
                ),

                metric(
                    'COVERAGE',
                    snapshot.coverage
                ),

                metric(
                    'FAVOURITES',
                    snapshot.favourites.toLocaleString()
                )
            );

            const ageHeader =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-section-title',

                        text:
                            'AGE PROFILE'
                    }
                );

            const ageList =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-bars'
                    }
                );

            for (
                const bucket
                of snapshot.buckets
            ) {
                const ratio =
                    snapshot.activeTotal
                        ? (
                            bucket.total /
                            snapshot.activeTotal
                        ) *
                        100
                        : 0;

                const row =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-bar-row'
                        }
                    );

                const top =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-bar-copy'
                        }
                    );

                top.append(
                    el(
                        'span',
                        {
                            className:
                                'strata-stats-bar-label',

                            text:
                                bucket.label.toUpperCase()
                        }
                    ),

                    el(
                        'span',
                        {
                            className:
                                'strata-stats-bar-value',

                            text:
                                `${bucket.total.toLocaleString()} · ${formatStatsPercent(bucket.total, snapshot.activeTotal)}`
                        }
                    )
                );

                const track =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-bar-track'
                        }
                    );

                const fill =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-bar-fill'
                        }
                    );

                fill.style.width =
                    `${Math.max(0, Math.min(100, ratio))}%`;

                track.appendChild(
                    fill
                );

                row.append(
                    top,
                    track
                );

                ageList.appendChild(
                    row
                );
            }

            const channelHeader =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-section-title strata-stats-channel-header',

                        text:
                            'CHANNEL POOL'
                    }
                );

            const channelList =
                el(
                    'div',
                    {
                        className:
                            'strata-stats-channels'
                    }
                );

            const maxChannelTotal =
                Math.max(
                    1,
                    ...snapshot.channels.map(
                        channel =>
                            channel.total
                    )
                );

            for (
                const channel
                of snapshot.channels
            ) {
                const row =
                    el(
                        'div',
                        {
                            className:
                                `strata-stats-channel-row${channel.enabled ? '' : ' disabled'}`
                        }
                    );

                const copy =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-channel-copy'
                        }
                    );

                const name =
                    el(
                        'span',
                        {
                            className:
                                'strata-stats-channel-name',

                            text:
                                channel.handle
                        }
                    );

                const meta =
                    el(
                        'span',
                        {
                            className:
                                'strata-stats-channel-meta',

                            text:
                                channel.enabled
                                    ? `${channel.total.toLocaleString()} tracks · ${channel.played.toLocaleString()} played`
                                    : `${channel.total.toLocaleString()} tracks · OFF`
                        }
                    );

                copy.append(
                    name,
                    meta
                );

                const bar =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-channel-bar'
                        }
                    );

                const fill =
                    el(
                        'div',
                        {
                            className:
                                'strata-stats-channel-fill'
                        }
                    );

                fill.style.width =
                    `${(
                        channel.total /
                        maxChannelTotal
                    ) * 100}%`;

                bar.appendChild(
                    fill
                );

                row.append(
                    copy,
                    bar
                );

                channelList.appendChild(
                    row
                );
            }

            body.append(
                hero,
                sessionHeader,
                sessionGrid,
                ageHeader,
                ageList,
                channelHeader,
                channelList
            );

            return;
        }

        if (
            utilityPanelOpen ===
            'settings'
        ) {
            title.textContent =
                'SETTINGS';

            const skinHeader =
                el(
                    'div',
                    {
                        className:
                            'strata-utility-header strata-skin-header',

                        text:
                            'SKIN'
                    }
                );

            const skinGrid =
                el(
                    'div',
                    {
                        className:
                            'strata-skin-grid'
                    }
                );

            for (
                const option
                of SKIN_OPTIONS
            ) {
                const skinButton =
                    btn(
                        '',
                        '',
                        `Use ${option.label}`
                    );

                skinButton.className =
                    'strata-skin-button';

                if (
                    option.id ===
                    currentSkin
                ) {
                    skinButton.classList.add(
                        'active'
                    );
                }

                const swatch =
                    el(
                        'span',
                        {
                            className:
                                'strata-skin-swatch'
                        }
                    );

                swatch.style.background =
                    option.swatch;

                // v8.6.0: a hairline ring keeps the mono swatches visible
                // on both light and dark panels; no glow for mono.
                swatch.style.boxShadow =
                    option.id === 'black'
                        ? '0 0 0 1px rgba(255,255,255,.45)'
                        : option.swatch.startsWith(
                            '#'
                        )
                            ? `0 0 10px ${option.swatch}55`
                            : '0 0 10px rgba(255,255,255,.25)';

                skinButton.append(
                    swatch,

                    el(
                        'span',
                        {
                            className:
                                'strata-skin-label',

                            text:
                                option.label
                        }
                    )
                );

                skinButton.addEventListener(
                    'click',
                    () => {
                        applySkin(
                            option.id
                        );

                        renderUtilityPanel();

                        setStatus(
                            `${option.label} skin active`
                        );
                    }
                );

                skinGrid.appendChild(
                    skinButton
                );
            }

            body.append(
                skinHeader,
                skinGrid
            );

            const visualHeader =
                el(
                    'div',
                    {
                        className:
                            'strata-utility-header strata-visual-settings-header',

                        text:
                            'VISUAL LAB'
                    }
                );

            const cycleLabel =
                el(
                    'div',
                    {
                        className:
                            'strata-visual-option-label',

                        text:
                            'ACTIVE VISUALS'
                    }
                );

            const cycleGrid =
                el(
                    'div',
                    {
                        className:
                            'strata-visual-cycle-grid'
                    }
                );

            for (
                const style
                of VISUALIZER_STYLES
            ) {
                const included =
                    isVisualizerStyleActive(
                        style.id
                    );

                const cycleButton =
                    btn(
                        '',
                        style.label,
                        included
                            ? `Remove ${style.label} from visual cycle`
                            : `Add ${style.label} to visual cycle`
                    );

                cycleButton.className =
                    `strata-visual-cycle-button${included ? ' active' : ''}`;

                cycleButton.addEventListener(
                    'click',
                    () => {
                        const nowIncluded =
                            isVisualizerStyleActive(
                                style.id
                            );

                        if (
                            setVisualizerStyleActive(
                                style.id,
                                !nowIncluded
                            )
                        ) {
                            renderUtilityPanel();

                            setStatus(
                                nowIncluded
                                    ? `${style.label} removed from visual cycle`
                                    : `${style.label} added to visual cycle`
                            );
                        }
                    }
                );

                cycleGrid.appendChild(
                    cycleButton
                );
            }

            body.append(
                visualHeader,
                cycleLabel,
                cycleGrid
            );

            const radioHeader =
                el(
                    'div',
                    {
                        className:
                            'strata-utility-header strata-visual-settings-header',

                        text:
                            'RADIO'
                    }
                );

            const makeModeGroup =
                (
                    labelText,
                    options,
                    activeId,
                    onPick
                ) => {
                    const wrap =
                        el(
                            'div',
                            {
                                className:
                                    'strata-mode-row'
                            }
                        );

                    wrap.appendChild(
                        el(
                            'div',
                            {
                                className:
                                    'strata-visual-option-label',

                                text:
                                    labelText
                            }
                        )
                    );

                    const group =
                        el(
                            'div',
                            {
                                className:
                                    'strata-mode-group'
                            }
                        );

                    for (
                        const option
                        of options
                    ) {
                        const pill =
                            btn(
                                '',
                                option.label,
                                option.title ||
                                    option.label
                            );

                        pill.className =
                            `strata-mode-pill${option.id === activeId ? ' active' : ''}`;

                        pill.addEventListener(
                            'click',
                            () => {
                                onPick(
                                    option.id
                                );

                                renderUtilityPanel();
                            }
                        );

                        group.appendChild(
                            pill
                        );
                    }

                    wrap.appendChild(
                        group
                    );

                    return wrap;
                };

            body.append(
                radioHeader,

                makeModeGroup(
                    'ERA',
                    RADIO_ERA_OPTIONS,
                    radioEra,
                    setRadioEra
                ),

                makeModeGroup(
                    'HARMONIC MIX',
                    [
                        {
                            id: 'off',
                            label: 'OFF',
                            title: 'Normal shuffle'
                        },
                        {
                            id: 'on',
                            label: 'ON',
                            title: 'Prefer remembered tracks in a compatible key / tempo'
                        }
                    ],
                    harmonicMixEnabled
                        ? 'on'
                        : 'off',
                    id =>
                        setHarmonicMixEnabled(
                            id ===
                                'on'
                        )
                )
            );

            const rows = [
                [
                    'Last master update',
                    masterSnapshotDisplay()
                ]
            ];

            for (
                const [
                    label,
                    value
                ]
                of rows
            ) {
                const row =
                    el(
                        'div',
                        {
                            className:
                                'strata-settings-row'
                        }
                    );

                row.append(
                    el(
                        'span',
                        {
                            text:
                                label
                        }
                    ),

                    el(
                        'span',
                        {
                            className:
                                'strata-settings-value',

                            text:
                                value
                        }
                    )
                );

                body.appendChild(
                    row
                );
            }

            return;
        }

        title.textContent =
            'ABOUT';

        const supportCard =
            el(
                'div',
                {
                    className:
                        'strata-support-card'
                }
            );

        supportCard.append(
            el(
                'div',
                {
                    className:
                        'strata-support-title',

                    text:
                        'BUY ME A COFFEE ☕'
                }
            ),

            el(
                'div',
                {
                    className:
                        'strata-support-copy',

                    text:
                        'Enjoying STRATA? If you fancy supporting the project, you can chip in via PayPal.'
                }
            )
        );

        /*
            v8.6.4: a direct PayPal.Me link replaces the old managed QR
            code, which PayPal no longer recognised.
        */
        const paypalLink =
            document.createElement(
                'a'
            );

        paypalLink.className =
            'strata-paypal-link';

        paypalLink.href =
            PAYPAL_SUPPORT_URL;

        paypalLink.target =
            '_blank';

        paypalLink.rel =
            'noopener noreferrer';

        paypalLink.textContent =
            'Support STRATA via PayPal ↗';

        paypalLink.title =
            'Opens paypal.me/COLMANBUCKLEY in a new tab';

        paypalLink.addEventListener(
            'click',
            event => {
                event.stopPropagation();
            }
        );

        supportCard.appendChild(
            paypalLink
        );

        const creatorLink =
            document.createElement(
                'a'
            );

        creatorLink.className =
            'strata-creator-link';

        creatorLink.href =
            'https://www.instagram.com/colman_buckley/';

        creatorLink.target =
            '_blank';

        creatorLink.rel =
            'noopener noreferrer';

        creatorLink.textContent =
            'CONTACT ↗';

        creatorLink.title =
            'Contact on Instagram';

        creatorLink.addEventListener(
            'click',
            event => {
                event.stopPropagation();
            }
        );

        body.append(
            el(
                'div',
                {
                    className:
                        'strata-about-mark',

                    text:
                        'STRATA'
                }
            ),

            creatorLink,
            supportCard,
            buildDiagnosticsRow()
        );
    }

    // ============================================================
    // DIAGNOSTICS (v8.5.94)
    // ============================================================

    function formatStamp(
        value
    ) {
        const number =
            Number(
                value
            ) ||
            0;

        return number
            ? new Date(
                number
            ).toISOString()
            : 'never';
    }

    function buildDiagnosticsText() {
        const enabled =
            getEnabledChannels();

        const lines = [
            'STRATA diagnostics',
            `Version: ${STRATA_VERSION} (STRATA)`,
            `Generated: ${new Date().toISOString()}`,
            `Browser: ${navigator.userAgent}`,
            `Page: ${location.pathname}${currentVideoId() ? ` · video ${currentVideoId()}` : ''}`,
            `Library: ${getUniqueTotal().toLocaleString()} tracks · ${enabled.length} channel(s) enabled`,
            `Favourites: ${Object.keys(favourites || {}).length}`,
            `Radio: ${radioEnabled ? 'on' : 'off'} · Visual engine: ${visualizerEnabled ? 'on' : 'off'} (${visualizerStyle}) · Skin: ${currentSkin}`,
            `Panel: ${expanded ? 'open' : 'closed'} · ${isPanelDocked() ? 'docked' : 'custom position'}`,
            `Seed: last check ${formatStamp(GM_getValue(HOSTED_SEED_LAST_CHECK_KEY, 0))} · last failure ${formatStamp(GM_getValue(HOSTED_SEED_LAST_FAILURE_KEY, 0))} · version ${GM_getValue(HOSTED_SEED_LAST_VERSION_KEY, '') || 'none'}`,
            `Ad on screen now: ${isAdPlaying() ? 'yes' : 'no'}`,
            `Debug log: ${strataDebugLogging ? 'on' : 'off'}`,
            `Autoplay policy: ${strataAutoplayPolicy()} · blocked this page: ${strataAutoplayBlockedCount}`,
            '',
            ...buildAnalysisDiagnosticsLines(),
            '',
            `Recent STRATA log (last ${Math.min(40, STRATA_LOG_BUFFER.length)} lines):`,
            ...STRATA_LOG_BUFFER.slice(
                -40
            )
        ];

        return lines.join(
            '\n'
        );
    }

    async function copyTextToClipboard(
        text
    ) {
        try {
            if (
                navigator.clipboard
                    ?.writeText
            ) {
                await navigator.clipboard.writeText(
                    text
                );

                return true;
            }
        } catch {}

        try {
            const area =
                document.createElement(
                    'textarea'
                );

            area.value =
                text;

            area.setAttribute(
                'readonly',
                ''
            );

            area.style.position =
                'fixed';

            area.style.opacity =
                '0';

            document.body.appendChild(
                area
            );

            area.select();

            const copied =
                document.execCommand(
                    'copy'
                );

            area.remove();

            return copied;

        } catch {
            return false;
        }
    }

    function buildDiagnosticsRow() {
        const row =
            el(
                'div',
                {
                    className:
                        'strata-diagnostics-row'
                }
            );

        const copy =
            btn(
                'strata-copy-diagnostics',
                'COPY DIAGNOSTICS',
                'Copy version, settings and recent log — paste it into a bug report'
            );

        copy.className =
            'strata-creator-link';

        copy.addEventListener(
            'click',
            async event => {
                event.stopPropagation();

                const copied =
                    await copyTextToClipboard(
                        buildDiagnosticsText()
                    );

                copy.textContent =
                    copied
                        ? 'COPIED ✓'
                        : 'COPY FAILED';

                setTimeout(
                    () => {
                        copy.textContent =
                            'COPY DIAGNOSTICS';
                    },
                    2000
                );
            }
        );

        const debug =
            btn(
                'strata-debug-toggle',
                '',
                'Show STRATA\'s detailed log in the browser console'
            );

        debug.className =
            'strata-creator-link';

        const paintDebug =
            () => {
                debug.textContent =
                    `DEBUG LOG: ${strataDebugLogging ? 'ON' : 'OFF'}`;

                debug.setAttribute(
                    'aria-pressed',
                    strataDebugLogging
                        ? 'true'
                        : 'false'
                );
            };

        paintDebug();

        debug.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                strataDebugLogging =
                    !strataDebugLogging;

                GM_setValue(
                    STRATA_DEBUG_LOG_KEY,
                    strataDebugLogging
                );

                paintDebug();
            }
        );

        row.append(
            copy,
            debug
        );

        return row;
    }

    // ============================================================
    // FIRST-RUN TIPS (v8.5.94)
    //
    // Shown once (until "Got it", or after three page loads) so new
    // users find the things STRATA never otherwise tells them.
    // ============================================================

    const FIRST_RUN_TIPS_KEY =
        'strata_v8594_first_run_tips';

    function showFirstRunTipsIfNeeded() {
        const state =
            GM_getValue(
                FIRST_RUN_TIPS_KEY,
                null
            ) ||
            {};

        if (
            state.dismissed ||
            (
                Number(
                    state.shown
                ) ||
                0
            ) >=
                3 ||
            !document.body ||
            document.getElementById(
                'strata-first-run-tips'
            )
        ) {
            return;
        }

        GM_setValue(
            FIRST_RUN_TIPS_KEY,
            {
                shown:
                    (
                        Number(
                            state.shown
                        ) ||
                        0
                    ) +
                    1
            }
        );

        const card =
            document.createElement(
                'div'
            );

        card.id =
            'strata-first-run-tips';

        card.setAttribute(
            'role',
            'dialog'
        );

        card.setAttribute(
            'aria-label',
            'STRATA tips'
        );

        Object.assign(
            card.style,
            {
                position:
                    'fixed',
                top:
                    '64px',
                left:
                    '8px',
                zIndex:
                    '2147483646',
                width:
                    'min(320px, calc(100vw - 16px))',
                padding:
                    '14px 16px 12px',
                borderRadius:
                    '12px',
                border:
                    strataInfoPalette().border,
                background:
                    strataInfoPalette().background,
                color:
                    strataInfoPalette().color,
                font:
                    '500 12px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                boxShadow:
                    strataInfoPalette().shadow
            }
        );

        const title =
            document.createElement(
                'div'
            );

        title.textContent =
            'Welcome to STRATA';

        Object.assign(
            title.style,
            {
                font:
                    '700 13px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                letterSpacing:
                    '.4px',
                marginBottom:
                    '8px',
                color:
                    strataInfoPalette().title
            }
        );

        card.appendChild(
            title
        );

        const tips = [
            'Click STRATA to open the player. Drag the button anywhere — it stays where you leave it.',
            'Drag the open player by its header, or resize it from the bottom-right corner. Double-click that corner to snap it back beside the video.',
            'Keyboard: + next track · − previous track · Enter adds to favourites.',
            'Radio plays continuously from hand-picked electronic music channels. Turn channels on or off under Channels.'
        ];

        for (
            const tip
            of tips
        ) {
            const line =
                document.createElement(
                    'div'
                );

            line.textContent =
                `· ${tip}`;

            line.style.margin =
                '0 0 6px';

            card.appendChild(
                line
            );
        }

        const done =
            document.createElement(
                'button'
            );

        done.type =
            'button';

        done.textContent =
            'Got it';

        Object.assign(
            done.style,
            {
                marginTop:
                    '4px',
                padding:
                    '5px 14px',
                borderRadius:
                    '8px',
                border:
                    strataInfoPalette().buttonBorder,
                background:
                    strataInfoPalette().buttonBackground,
                color:
                    strataInfoPalette().title,
                font:
                    '700 11px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                letterSpacing:
                    '.5px',
                cursor:
                    'pointer'
            }
        );

        done.addEventListener(
            'click',
            () => {
                GM_setValue(
                    FIRST_RUN_TIPS_KEY,
                    {
                        dismissed:
                            true
                    }
                );

                card.remove();
            }
        );

        card.appendChild(
            done
        );

        document.body.appendChild(
            card
        );
    }

    function createUI() {
        if (
            document.getElementById(
                'strata-root'
            )
        ) {
            return;
        }

        const root =
            el(
                'div',
                {
                    id:
                        'strata-root'
                }
            );

        root.dataset.skin =
            currentSkin;

        // --------------------------------------------------------
        // MINI PLAYER
        // --------------------------------------------------------

        const mini =
            el(
                'div',
                {
                    id:
                        'strata-mini',

                    title:
                        'Drag to reposition'
                }
            );

        const miniFavourite =
            btn(
                'strata-mini-favourite',
                '♡',
                'Favourite current track'
            );

        const miniBrand =
            btn(
                'strata-mini-brand',
                '',
                'Open STRATA'
            );

        const miniLogo =
            el(
                'span',
                {
                    id:
                        'strata-mini-logo',

                    text:
                        'STRATA'
                }
            );

        const miniDot =
            el(
                'span',
                {
                    id:
                        'strata-mini-dot'
                }
            );

        miniBrand.append(
            miniLogo,
            miniDot
        );

        const miniNext =
            btn(
                'strata-mini-next',
                '›',
                'Next track · shortcut: +'
            );

        mini.append(
            miniFavourite,
            miniBrand,
            miniNext
        );

        // --------------------------------------------------------
        // BIG PANEL
        // --------------------------------------------------------

        const panel =
            el(
                'div',
                {
                    id:
                        'strata-panel'
                }
            );

        const header =
            el(
                'div',
                {
                    id:
                        'strata-header',

                    title:
                        'Drag STRATA to reposition'
                }
            );

        const titleArea =
            el(
                'div',
                {
                    id:
                        'strata-title-area'
                }
            );

        const title =
            el(
                'span',
                {
                    id:
                        'strata-title',

                    text:
                        'STRATA'
                }
            );

        const activity =
            el(
                'span',
                {
                    id:
                        'strata-activity'
                }
            );

        titleArea.append(
            title,
            activity
        );

        const close =
            btn(
                'strata-close',
                '×',
                'Collapse'
            );

        header.append(
            titleArea,
            close
        );

        const resizeGrip =
            el(
                'div',
                {
                    id:
                        'strata-resize-grip',

                    title:
                        'Drag to resize · double-click to reset size'
                }
            );

        // NOW PLAYING CARD

        const now =
            el(
                'div',
                {
                    id:
                        'strata-now'
                }
            );

        const nowText =
            el(
                'div',
                {
                    id:
                        'strata-now-text'
                }
            );

        nowText.append(
            el(
                'div',
                {
                    className:
                        'strata-eyebrow',

                    text:
                        'NOW PLAYING'
                }
            ),

            el(
                'div',
                {
                    id:
                        'strata-now-title',

                    text:
                        'YouTube'
                }
            ),

            el(
                'div',
                {
                    id:
                        'strata-now-channel'
                }
            )
        );

        const favourite =
            btn(
                'strata-favourite',
                '♡',
                'Favourite'
            );

        now.append(
            nowText,
            favourite
        );

        const releaseInfo =
            el(
                'div',
                {
                    id:
                        'strata-release-info'
                }
            );

        const focusBar =
            el(
                'div',
                {
                    id:
                        'strata-focus-bar'
                }
            );

        // PLAYBACK

        const controls =
            el(
                'div',
                {
                    id:
                        'strata-controls'
                }
            );

        const previous =
            btn(
                'strata-prev',
                '|◀',
                'Previous · shortcut: -'
            );

        const playPause =
            btn(
                'strata-play',
                '▶',
                'Play'
            );

        const next =
            btn(
                'strata-next',
                '▶|',
                'Next · shortcut: +'
            );

        controls.append(
            previous,
            playPause,
            next
        );

        // RADIO ROW + SWITCH

        const radio =
            btn(
                'strata-radio',
                '',
                'Toggle continuous radio'
            );

        const radioCopy =
            el(
                'span',
                {
                    className:
                        'strata-radio-copy'
                }
            );

        radioCopy.append(
            el(
                'span',
                {
                    className:
                        'strata-radio-label',

                    text:
                        'RADIO'
                }
            ),

            el(
                'span',
                {
                    className:
                        'strata-radio-sub',

                    text:
                        'Continuous playback'
                }
            )
        );

        const radioSwitch =
            el(
                'span',
                {
                    id:
                        'strata-radio-switch',

                    className:
                        'strata-switch'
                }
            );

        radioSwitch.appendChild(
            el(
                'span',
                {
                    className:
                        'strata-switch-knob'
                }
            )
        );

        radio.append(
            el(
                'span',
                {
                    className:
                        'strata-radio-icon',

                    text:
                        '◉'
                }
            ),
            radioCopy,
            radioSwitch
        );

        // VISUAL ENGINE ROW + SWITCH (front-face toggle)

        const visual =
            btn(
                'strata-visual-fronttoggle',
                '',
                'Toggle visual engine'
            );

        const visualCopyRow =
            el(
                'span',
                {
                    className:
                        'strata-radio-copy'
                }
            );

        visualCopyRow.append(
            el(
                'span',
                {
                    className:
                        'strata-radio-label',

                    text:
                        'VISUAL ENGINE'
                }
            ),

            el(
                'span',
                {
                    className:
                        'strata-radio-sub',

                    text:
                        'Audio-reactive graphics'
                }
            )
        );

        const visualSwitchRow =
            el(
                'span',
                {
                    id:
                        'strata-visual-switch',

                    className:
                        'strata-switch'
                }
            );

        visualSwitchRow.appendChild(
            el(
                'span',
                {
                    className:
                        'strata-switch-knob'
                }
            )
        );

        visual.append(
            el(
                'span',
                {
                    className:
                        'strata-radio-icon',

                    text:
                        '◈'
                }
            ),
            visualCopyRow,
            visualSwitchRow
        );

        // RELEASE LINKS

        const linksToggle =
            btn(
                'strata-links-toggle',
                '',
                'Release links'
            );

        const linksLabel =
            el(
                'span',
                {
                    className:
                        'strata-section-label'
                }
            );

        linksLabel.append(
            el(
                'span',
                {
                    className:
                        'strata-section-icon',

                    text:
                        '⌁'
                }
            ),

            el(
                'span',
                {
                    text:
                        'RELEASE LINKS'
                }
            ),

            el(
                'span',
                {
                    id:
                        'strata-links-count'
                }
            )
        );

        const linksChevron =
            el(
                'span',
                {
                    id:
                        'strata-links-chevron',

                    text:
                        '⌄'
                }
            );

        linksToggle.append(
            linksLabel,
            linksChevron
        );

        const linksBody =
            el(
                'div',
                {
                    id:
                        'strata-links-body'
                }
            );

        // CHANNELS

        const channelToggle =
            btn(
                'strata-channel-toggle',
                '',
                'Channels'
            );

        const channelLabel =
            el(
                'span',
                {
                    className:
                        'strata-section-label'
                }
            );

        channelLabel.append(
            el(
                'span',
                {
                    className:
                        'strata-section-icon',

                    text:
                        '◎'
                }
            ),

            el(
                'span',
                {
                    text:
                        'CHANNELS'
                }
            ),

            el(
                'span',
                {
                    id:
                        'strata-channel-count'
                }
            )
        );

        const channelChevron =
            el(
                'span',
                {
                    id:
                        'strata-channel-chevron',

                    text:
                        '⌄'
                }
            );

        channelToggle.append(
            channelLabel,
            channelChevron
        );

        const channelManager =
            el(
                'div',
                {
                    id:
                        'strata-channel-manager'
                }
            );

        const channelList =
            el(
                'div',
                {
                    id:
                        'strata-channel-list'
                }
            );

        // Add-channel input removed: STRATA now uses a fixed master-seed
        // channel set. The list below stays interactive for enable/disable
        // filtering, but channels can no longer be added from the UI.

        channelManager.append(
            channelList
        );

        // UTILITY DRAWER

        const utilityPanel =
            el(
                'div',
                {
                    id:
                        'strata-utility-panel'
                }
            );

        const utilityHeader =
            el(
                'div',
                {
                    className:
                        'strata-utility-header'
                }
            );

        const utilityTitle =
            el(
                'span',
                {
                    id:
                        'strata-utility-title',

                    text:
                        'LIBRARY'
                }
            );

        const utilityClose =
            btn(
                'strata-utility-close',
                '×',
                'Close section'
            );

        utilityHeader.append(
            utilityTitle,
            utilityClose
        );

        const utilityBody =
            el(
                'div',
                {
                    id:
                        'strata-utility-body'
                }
            );

        utilityPanel.append(
            utilityHeader,
            utilityBody
        );

        // AUDIO VISUAL ENGINE

        const visualizer =
            el(
                'div',
                {
                    id:
                        'strata-visualizer'
                }
            );

        const visualizerCanvas =
            document.createElement(
                'canvas'
            );

        visualizerCanvas.id =
            'strata-visualizer-canvas';

        visualizerCanvas.setAttribute(
            'aria-hidden',
            'true'
        );

        const visualHud =
            el(
                'div',
                {
                    className:
                        'strata-visualizer-hud'
                }
            );

        const visualStyleLabel =
            el(
                'span',
                {
                    id:
                        'strata-visualizer-style-label',

                    className:
                        'strata-visualizer-brand',

                    text:
                        'VECTOR · BALANCED'
                }
            );

        const visualModeSwitch =
            el(
                'div',
                {
                    className:
                        'strata-visual-mode-switch'
                }
            );

        const visualPrevious =
            btn(
                '',
                '‹',
                'Previous visual mode'
            );

        visualPrevious.className =
            'strata-visual-mode-arrow';

        const visualNext =
            btn(
                '',
                '›',
                'Next visual mode'
            );

        visualNext.className =
            'strata-visual-mode-arrow';

        visualPrevious.addEventListener(
            'pointerdown',
            event => {
                event.stopPropagation();
            }
        );

        visualNext.addEventListener(
            'pointerdown',
            event => {
                event.stopPropagation();
            }
        );

        visualPrevious.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                cycleVisualizerStyle(
                    -1
                );
            }
        );

        visualNext.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                cycleVisualizerStyle(
                    1
                );
            }
        );

        visualModeSwitch.append(
            visualPrevious,
            visualNext
        );

        const visualMode =
            el(
                'span',
                {
                    id:
                        'strata-visualizer-mode',

                    text:
                        'TRANSPORT'
                }
            );

        const visualHudRight =
            el(
                'div',
                {
                    className:
                        'strata-visualizer-hud-right'
                }
            );

        visualHudRight.append(
            visualModeSwitch,
            visualMode
        );

        visualHud.append(
            visualStyleLabel,
            visualHudRight
        );

        const visualMeter =
            el(
                'div',
                {
                    id:
                        'strata-visualizer-meter',

                    text:
                        'PASSIVE TRANSPORT SYNC'
                }
            );

        const visualReactivitySwitch =
            el(
                'div',
                {
                    className:
                        'strata-visual-reactivity-switch'
                }
            );

        for (
            const [
                id,
                profile
            ]
            of Object.entries(
                VISUALIZER_REACTIVITY
            )
        ) {
            const reaction =
                btn(
                    `strata-visual-reactivity-${id}`,
                    profile.label,
                    `${profile.label} visual reactivity`
                );

            reaction.className =
                `strata-visual-reactivity-pill${id === visualizerReactivity ? ' active' : ''}`;

            reaction.setAttribute(
                'aria-pressed',
                id ===
                    visualizerReactivity
                    ? 'true'
                    : 'false'
            );

            reaction.addEventListener(
                'pointerdown',
                event => {
                    event.stopPropagation();
                }
            );

            reaction.addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    setVisualizerReactivity(
                        id
                    );

                    setStatus(
                        `${profile.label} visual reactivity`
                    );
                }
            );

            visualReactivitySwitch.appendChild(
                reaction
            );
        }

        visualizer.append(
            visualizerCanvas,
            visualHud,
            visualMeter,
            visualReactivitySwitch
        );

        visualizer.addEventListener(
            'pointerdown',
            () => {
                if (
                    visualizerContext
                        ?.state ===
                    'suspended'
                ) {
                    visualizerContext
                        .resume()
                        .catch(
                            () => {}
                        );
                }

                attachVisualizerAudio();
            }
        );

        visualizer.title =
            'Double-click visual engine for fullscreen';

        visualizer.addEventListener(
            'dblclick',
            async event => {
                if (
                    event.target.closest(
                        'button'
                    )
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                try {
                    if (
                        document.fullscreenElement ===
                            visualizer
                    ) {
                        await document.exitFullscreen();

                    } else if (
                        !document.fullscreenElement
                    ) {
                        await visualizer.requestFullscreen();
                    }

                } catch (
                    error
                ) {
                    console.warn(
                        '[STRATA] visual fullscreen failed',
                        error
                    );
                }
            }
        );

        document.addEventListener(
            'fullscreenchange',
            () => {
                const isVisualFullscreen =
                    document.fullscreenElement ===
                        visualizer;

                visualizer.classList.toggle(
                    'strata-visual-fullscreen',
                    isVisualFullscreen
                );

                /*
                    Force one fresh canvas measurement after entering/exiting
                    fullscreen so the visual immediately fills the new area.
                */

                visualizerCanvasCssWidth =
                    0;

                visualizerCanvasCssHeight =
                    0;

                requestAnimationFrame(
                    () => {
                        ensureVisualizerCanvasMetrics(
                            visualizerCanvas
                        );

                        if (
                            visualizerEnabled
                        ) {
                            startVisualizer();
                        }
                    }
                );
            }
        );

        // TRACK ANALYSIS

        const trackAnalysis =
            el(
                'div',
                {
                    id:
                        'strata-track-analysis'
                }
            );

        const trackAnalysisHeader =
            el(
                'div',
                {
                    className:
                        'strata-analysis-header'
                }
            );

        trackAnalysisHeader.append(
            el(
                'span',
                {
                    className:
                        'strata-analysis-title',

                    text:
                        'TRACK ANALYSIS'
                }
            ),

            el(
                'span',
                {
                    id:
                        'strata-analysis-state',

                    className:
                        'strata-analysis-state',

                    text:
                        'ANALYSING'
                }
            )
        );

        const trackAnalysisGrid =
            el(
                'div',
                {
                    className:
                        'strata-analysis-grid'
                }
            );

        function makeAnalysisMetric(
            label,
            id
        ) {
            const metric =
                el(
                    'div',
                    {
                        className:
                            'strata-analysis-metric'
                    }
                );

            metric.append(
                el(
                    'span',
                    {
                        className:
                            'strata-analysis-label',

                        text:
                            label
                    }
                ),

                el(
                    'span',
                    {
                        id,
                        className:
                            'strata-analysis-value',

                        text:
                            '—'
                    }
                )
            );

            return metric;
        }

        trackAnalysisGrid.append(
            makeAnalysisMetric(
                'BPM',
                'strata-analysis-bpm'
            ),

            makeAnalysisMetric(
                'KEY',
                'strata-analysis-key'
            ),

            makeAnalysisMetric(
                'SCALE',
                'strata-analysis-scale'
            ),

            makeAnalysisMetric(
                'CAMELOT',
                'strata-analysis-camelot'
            )
        );

        const trackAnalysisFooter =
            el(
                'div',
                {
                    className:
                        'strata-analysis-footer'
                }
            );

        trackAnalysisFooter.append(
            el(
                'span',
                {
                    id:
                        'strata-analysis-tempo-confidence',

                    text:
                        'TEMPO LEARNING'
                }
            ),

            el(
                'span',
                {
                    className:
                        'strata-analysis-separator',

                    text:
                        '·'
                }
            ),

            el(
                'span',
                {
                    id:
                        'strata-analysis-key-confidence',

                    text:
                        'KEY LEARNING'
                }
            ),

            el(
                'span',
                {
                    className:
                        'strata-analysis-estimate',

                    text:
                        'LOCAL AUDIO ESTIMATE'
                }
            )
        );

        trackAnalysis.append(
            trackAnalysisHeader,
            trackAnalysisGrid,
            trackAnalysisFooter
        );

        // FOOTER NAV

        const footer =
            el(
                'div',
                {
                    id:
                        'strata-footer'
                }
            );

        function makeFooterTab(
            id,
            panelName,
            icon,
            label
        ) {
            const tab =
                btn(
                    id,
                    '',
                    label
                );

            tab.className =
                'strata-footer-tab';

            tab.dataset.panel =
                panelName;

            tab.append(
                el(
                    'span',
                    {
                        className:
                            'strata-footer-icon',

                        text:
                            icon
                    }
                ),

                el(
                    'span',
                    {
                        className:
                            'strata-footer-label',

                        text:
                            label.toUpperCase()
                    }
                )
            );

            return tab;
        }

        const libraryTab =
            makeFooterTab(
                'strata-tab-library',
                'library',
                '▱',
                'Library'
            );

        const statsTab =
            makeFooterTab(
                'strata-tab-stats',
                'stats',
                '▥',
                'Stats'
            );

        const settingsTab =
            makeFooterTab(
                'strata-tab-settings',
                'settings',
                '⚙',
                'Settings'
            );

        const aboutTab =
            makeFooterTab(
                'strata-tab-about',
                'about',
                'ⓘ',
                'About'
            );

        footer.append(
            libraryTab,
            statsTab,
            settingsTab,
            aboutTab
        );

        panel.append(
            header,
            now,
            releaseInfo,
            focusBar,
            controls,
            radio,
            linksToggle,
            linksBody,
            channelToggle,
            channelManager,
            visual,
            utilityPanel,
            visualizer,
            trackAnalysis,
            footer
        );

        root.append(
            mini,
            panel,
            resizeGrip
        );

        // ========================================================
        // NEON CYAN STYLE
        // ========================================================

        const style =
            document.createElement(
                'style'
            );

        style.textContent = `
            #strata-root {
                --st-accent-rgb: 0, 242, 255;
                --st-accent-bright-rgb: 75, 251, 255;
                --st-accent-glow-rgb: 92, 255, 255;
                --st-cyan: rgb(var(--st-accent-rgb));
                --st-cyan-bright: rgb(var(--st-accent-bright-rgb));
                --st-cyan-soft: rgba(var(--st-accent-rgb), .16);
                --st-cyan-line: rgba(var(--st-accent-rgb), .44);
                --st-cyan-faint: rgba(var(--st-accent-rgb), .09);
                --st-black: rgba(2, 8, 10, .975);
                --st-card: rgba(5, 15, 18, .86);
                --st-white: rgba(244, 252, 253, .94);
                --st-muted: rgba(202, 225, 228, .55);
                position: fixed;
                z-index: 2147483647;
                font-family: Inter, Roboto, Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
            }

            #strata-root[data-skin="violet"] {
                --st-accent-rgb: 155, 92, 255;
                --st-accent-bright-rgb: 198, 155, 255;
                --st-accent-glow-rgb: 185, 128, 255;
            }

            #strata-root[data-skin="lime"] {
                --st-accent-rgb: 183, 255, 0;
                --st-accent-bright-rgb: 221, 255, 107;
                --st-accent-glow-rgb: 198, 255, 66;
            }

            #strata-root[data-skin="magenta"] {
                --st-accent-rgb: 255, 43, 214;
                --st-accent-bright-rgb: 255, 126, 232;
                --st-accent-glow-rgb: 255, 79, 224;
            }

            #strata-root[data-skin="amber"] {
                --st-accent-rgb: 255, 152, 0;
                --st-accent-bright-rgb: 255, 194, 86;
                --st-accent-glow-rgb: 255, 174, 46;
            }

            #strata-root[data-skin="red"] {
                --st-accent-rgb: 255, 59, 79;
                --st-accent-bright-rgb: 255, 126, 139;
                --st-accent-glow-rgb: 255, 82, 100;
            }

            #strata-root[data-skin="blue"] {
                --st-accent-rgb: 61, 123, 255;
                --st-accent-bright-rgb: 140, 178, 255;
                --st-accent-glow-rgb: 100, 150, 255;
            }

            #strata-root[data-skin="mint"] {
                --st-accent-rgb: 45, 255, 196;
                --st-accent-bright-rgb: 150, 255, 225;
                --st-accent-glow-rgb: 92, 255, 210;
            }
            /* INK BLACK (v8.6.0): the dark UI with a white accent. */
            #strata-root[data-skin="black"] {
                --st-accent-rgb: 236, 236, 236;
                --st-accent-bright-rgb: 255, 255, 255;
                --st-accent-glow-rgb: 255, 255, 255;
                --st-black: rgba(10, 10, 10, .975);
                --st-card: rgba(18, 18, 18, .86);
                --st-white: rgba(245, 245, 245, .94);
                --st-muted: rgba(220, 220, 220, .55);
            }
            /* DRUM MACHINE SKINS (v8.6.0) --------------------------
               808: warm orange, cream text, and its famous row of 16
               step keys (red / orange / yellow / cream) under the header.
               909: see its own block below. */
            #strata-root[data-skin="808"] #strata-header,
            #strata-root[data-skin="909"] #strata-header {
                position: relative;
            }
            #strata-root[data-skin="808"] #strata-header::after,
            #strata-root[data-skin="909"] #strata-header::after {
                content: '';
                position: absolute;
                left: 3px;
                right: 3px;
                bottom: -8px;
                height: 4px;
                border-radius: 1px;
                pointer-events: none;
            }
            #strata-root[data-skin="808"] #strata-header::after {
                background: linear-gradient(90deg, transparent 0.000%, #e5402f 0.000%, #e5402f 5.350%, transparent 5.350%, transparent 6.250%, #e5402f 6.250%, #e5402f 11.600%, transparent 11.600%, transparent 12.500%, #e5402f 12.500%, #e5402f 17.850%, transparent 17.850%, transparent 18.750%, #e5402f 18.750%, #e5402f 24.100%, transparent 24.100%, transparent 25.000%, #f5821f 25.000%, #f5821f 30.350%, transparent 30.350%, transparent 31.250%, #f5821f 31.250%, #f5821f 36.600%, transparent 36.600%, transparent 37.500%, #f5821f 37.500%, #f5821f 42.850%, transparent 42.850%, transparent 43.750%, #f5821f 43.750%, #f5821f 49.100%, transparent 49.100%, transparent 50.000%, #f7c51e 50.000%, #f7c51e 55.350%, transparent 55.350%, transparent 56.250%, #f7c51e 56.250%, #f7c51e 61.600%, transparent 61.600%, transparent 62.500%, #f7c51e 62.500%, #f7c51e 67.850%, transparent 67.850%, transparent 68.750%, #f7c51e 68.750%, #f7c51e 74.100%, transparent 74.100%, transparent 75.000%, #ece5d0 75.000%, #ece5d0 80.350%, transparent 80.350%, transparent 81.250%, #ece5d0 81.250%, #ece5d0 86.600%, transparent 86.600%, transparent 87.500%, #ece5d0 87.500%, #ece5d0 92.850%, transparent 92.850%, transparent 93.750%, #ece5d0 93.750%, #ece5d0 99.100%, transparent 99.100%);
            }

            #strata-root * {
                box-sizing: border-box;
            }

            #strata-root button,
            #strata-root input {
                font-family: inherit;
            }

            html.strata-is-dragging,
            html.strata-is-dragging * {
                user-select: none !important;
                cursor: grabbing !important;
            }

            html.strata-is-resizing,
            html.strata-is-resizing * {
                user-select: none !important;
                cursor: nwse-resize !important;
            }

            /* MINI ------------------------------------------------ */

            #strata-mini {
                position: relative;
                display: grid;
                grid-template-columns: 40px 1fr 40px;
                width: ${MINI_WIDTH}px;
                height: ${MINI_HEIGHT}px;
                padding: 2px;
                overflow: hidden;
                isolation: isolate;
                cursor: grab;
                touch-action: none;
                border: 1px solid var(--st-cyan);
                border-radius: 14px;
                background:
                    linear-gradient(145deg, rgba(4,18,21,.98), rgba(1,7,9,.99));
                box-shadow:
                    0 0 0 1px rgba(var(--st-accent-rgb),.05),
                    0 0 16px rgba(var(--st-accent-rgb),.10),
                    0 10px 26px rgba(0,0,0,.36),
                    inset 0 1px 0 rgba(var(--st-accent-glow-rgb),.08);
                transition:
                    border-color .18s ease,
                    box-shadow .18s ease,
                    transform .18s ease;
            }

            #strata-mini::before {
                content: '';
                position: absolute;
                inset: -1px;
                z-index: -1;
                border-radius: 15px;
                pointer-events: none;
                background:
                    linear-gradient(
                        110deg,
                        transparent 0%,
                        transparent 38%,
                        rgba(var(--st-accent-rgb),.02) 44%,
                        rgba(var(--st-accent-bright-rgb),.34) 50%,
                        rgba(var(--st-accent-rgb),.03) 57%,
                        transparent 64%,
                        transparent 100%
                    );
                background-size: 260% 100%;
                background-position: 120% 0;
                opacity: .45;
                animation: strataCyanSheen 11s ease-in-out infinite;
            }

            #strata-mini::after {
                content: '';
                position: absolute;
                inset: 0;
                pointer-events: none;
                border-radius: 13px;
                box-shadow: inset 0 0 12px rgba(var(--st-accent-rgb),.025);
                animation: strataCyanBreath 6.5s ease-in-out infinite;
            }

            @keyframes strataCyanSheen {
                0%,58% {
                    background-position: 120% 0;
                    opacity: .12;
                }
                72% {
                    opacity: .5;
                }
                88% {
                    background-position: -120% 0;
                    opacity: .28;
                }
                100% {
                    background-position: -120% 0;
                    opacity: .08;
                }
            }

            @keyframes strataCyanBreath {
                0%,100% { opacity: .28; }
                50% { opacity: .72; }
            }

            #strata-mini:hover {
                border-color: var(--st-cyan-bright);
                box-shadow:
                    0 0 0 1px rgba(var(--st-accent-rgb),.08),
                    0 0 21px rgba(var(--st-accent-rgb),.16),
                    0 12px 30px rgba(0,0,0,.38),
                    inset 0 1px 0 rgba(var(--st-accent-glow-rgb),.10);
                transform: translateY(-1px);
            }

            #strata-mini.dragging {
                transform: none;
            }

            #strata-mini.dragging::before,
            #strata-mini.dragging::after {
                animation-play-state: paused;
            }

            #strata-mini-favourite,
            #strata-mini-brand,
            #strata-mini-next {
                position: relative;
                z-index: 2;
                border: 0;
                outline: 0;
                background: transparent;
                color: var(--st-cyan-bright);
            }

            #strata-mini-favourite {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 34px;
                margin: 2px 0 2px 2px;
                padding: 0;
                border-right: 1px solid rgba(var(--st-accent-rgb),.25);
                border-radius: 10px 0 0 10px;
                color: var(--st-cyan);
                font-size: 21px;
                line-height: 1;
                cursor: pointer;
                transition: background .14s ease, color .14s ease, text-shadow .14s ease;
            }

            #strata-mini-favourite:hover,
            #strata-mini-favourite.active {
                background: rgba(var(--st-accent-rgb),.075);
                color: var(--st-cyan-bright);
                text-shadow: 0 0 10px rgba(var(--st-accent-rgb),.30);
            }

            #strata-mini-brand {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 10px;
                border-radius: 2px;
                cursor: grab;
            }

            #strata-mini-brand:hover {
                background: rgba(var(--st-accent-rgb),.045);
            }

            #strata-mini-logo {
                font-size: 11px;
                font-weight: 760;
                letter-spacing: 3.2px;
                text-shadow: 0 0 9px rgba(var(--st-accent-rgb),.25);
                transform: translateX(1px);
            }

            #strata-mini-dot {
                position: absolute;
                top: 7px;
                right: 7px;
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: rgba(var(--st-accent-rgb),.32);
            }

            #strata-mini.active #strata-mini-dot,
            #strata-activity.active {
                background: var(--st-cyan-bright);
                box-shadow: 0 0 8px rgba(var(--st-accent-rgb),.65);
                animation: strataActivePulse 1.7s ease-in-out infinite;
            }

            @keyframes strataActivePulse {
                0%,100% { opacity: .35; }
                50% { opacity: 1; }
            }

            #strata-mini-next {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 34px;
                margin: 2px 2px 2px 0;
                padding: 0;
                border-left: 1px solid rgba(var(--st-accent-rgb),.25);
                border-radius: 0 10px 10px 0;
                font-size: 23px;
                line-height: 1;
                cursor: pointer;
                transition: background .14s ease, color .14s ease;
            }

            #strata-mini-next:hover {
                background: rgba(var(--st-accent-rgb),.075);
                color: #fff;
            }

            /* PANEL ----------------------------------------------- */

            #strata-panel {
                position: relative;
                display: none;
                width: ${PANEL_WIDTH}px;
                min-width: ${PANEL_MIN_WIDTH}px;
                min-height: ${PANEL_MIN_HEIGHT}px;
                max-width: calc(100vw - 16px);
                max-height: calc(100vh - 16px);
                overflow: auto;
                overscroll-behavior: contain;
                scrollbar-width: thin;
                scrollbar-color: rgba(var(--st-accent-rgb),.22) transparent;
                padding: 17px;
                border: 1px solid var(--st-cyan);
                border-radius: 18px;
                background:
                    radial-gradient(circle at 50% 0%, rgba(var(--st-accent-rgb),.055), transparent 27%),
                    linear-gradient(160deg, rgba(3,13,16,.985), rgba(1,7,9,.992));
                color: var(--st-white);
                box-shadow:
                    0 0 0 1px rgba(var(--st-accent-rgb),.035),
                    0 0 28px rgba(var(--st-accent-rgb),.08),
                    0 28px 80px rgba(0,0,0,.56),
                    inset 0 1px 0 rgba(76,251,255,.07);
                backdrop-filter: blur(28px) saturate(120%);
            }

            #strata-root.expanded #strata-mini {
                display: none;
            }

            #strata-root.expanded #strata-panel {
                display: block;
                animation: strataPanelOpen .17s cubic-bezier(.2,.8,.2,1);
            }

            @keyframes strataPanelOpen {
                from {
                    opacity: 0;
                    transform: translateY(6px) scale(.985);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            #strata-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 34px;
                margin-bottom: 12px;
                padding: 0 3px;
                cursor: grab;
                touch-action: none;
            }

            #strata-panel.dragging #strata-header {
                cursor: grabbing;
            }

            #strata-panel.dragging {
                animation: none !important;
                box-shadow:
                    0 28px 80px rgba(0,0,0,.62),
                    0 0 30px rgba(var(--st-accent-rgb),.12),
                    inset 0 0 0 1px rgba(var(--st-accent-rgb),.16);
            }

            #strata-panel.resizing {
                animation: none !important;
                box-shadow:
                    0 28px 80px rgba(0,0,0,.62),
                    0 0 34px rgba(var(--st-accent-rgb),.15),
                    inset 0 0 0 1px rgba(var(--st-accent-rgb),.20);
            }

            #strata-resize-grip {
                display: none;
                position: absolute;
                z-index: 8;
                right: 3px;
                bottom: 3px;
                width: 22px;
                height: 22px;
                cursor: nwse-resize;
                touch-action: none;
                opacity: .72;
            }

            #strata-root.expanded #strata-resize-grip {
                display: block;
            }

            #strata-resize-grip::before,
            #strata-resize-grip::after {
                content: '';
                position: absolute;
                right: 4px;
                bottom: 4px;
                height: 1px;
                transform-origin: right center;
                transform: rotate(-45deg);
                background: var(--st-cyan-bright);
                box-shadow: 0 0 7px rgba(var(--st-accent-rgb),.42);
                pointer-events: none;
            }

            #strata-resize-grip::before {
                width: 15px;
            }

            #strata-resize-grip::after {
                width: 9px;
                right: 3px;
                bottom: 8px;
                opacity: .68;
            }

            #strata-resize-grip:hover {
                opacity: 1;
            }

            #strata-title-area {
                display: flex;
                align-items: center;
                gap: 11px;
            }

            #strata-title {
                color: var(--st-cyan-bright);
                font-size: 20px;
                font-weight: 760;
                letter-spacing: 6px;
                text-shadow: 0 0 13px rgba(var(--st-accent-rgb),.22);
            }

            #strata-activity {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: rgba(var(--st-accent-rgb),.22);
            }

            #strata-close,
            #strata-utility-close {
                width: 28px;
                height: 28px;
                padding: 0;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: rgba(205,238,240,.48);
                cursor: pointer;
                font-size: 18px;
            }

            #strata-close:hover,
            #strata-utility-close:hover {
                background: rgba(var(--st-accent-rgb),.06);
                color: var(--st-cyan-bright);
            }

            #strata-now {
                display: grid;
                grid-template-columns: minmax(0,1fr) 38px;
                align-items: center;
                gap: 9px;
                padding: 10px 13px;
                margin-bottom: 9px;
                border: 1px solid rgba(var(--st-accent-rgb),.33);
                border-radius: 10px;
                background: rgba(2,9,11,.58);
                box-shadow: inset 0 0 16px rgba(var(--st-accent-rgb),.012);
            }

            .strata-eyebrow {
                margin-bottom: 5px;
                color: var(--st-cyan);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .8px;
            }

            #strata-now-title {
                display: -webkit-box;
                overflow: hidden;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 2;
                line-clamp: 2;
                color: var(--st-white);
                font-size: 13px;
                font-weight: 560;
                line-height: 1.22;
            }

            #strata-now-channel {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                margin-top: 4px;
                color: var(--st-cyan);
                font-size: 10px;
            }

            #strata-favourite {
                width: 38px;
                height: 38px;
                padding: 0;
                border: 0;
                border-radius: 9px;
                background: transparent;
                color: var(--st-cyan);
                cursor: pointer;
                font-size: 25px;
                line-height: 1;
            }

            #strata-favourite:hover,
            #strata-favourite.active {
                background: rgba(var(--st-accent-rgb),.055);
                color: var(--st-cyan-bright);
                text-shadow: 0 0 10px rgba(var(--st-accent-rgb),.28);
            }

            #strata-release-info {
                display: none;
                margin-bottom: 7px;
                padding: 9px 10px 8px;
                border: 1px solid rgba(var(--st-accent-rgb), .22);
                border-radius: 10px;
                background: rgba(var(--st-accent-rgb), .025);
            }

            #strata-release-info.visible {
                display: block;
            }

            .strata-profile-icons {
                display: inline-flex;
                align-items: center;
                justify-content: flex-end;
                gap: 4px;
                min-width: 0;
            }

            .strata-profile-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                border: 1px solid rgba(var(--st-accent-rgb), .18);
                border-radius: 6px;
                color: rgba(var(--st-accent-bright-rgb), .75);
                background: rgba(var(--st-accent-rgb), .035);
                text-decoration: none;
                transition:
                    color .14s ease,
                    border-color .14s ease,
                    background .14s ease,
                    box-shadow .14s ease,
                    transform .14s ease;
            }

            .strata-profile-icon svg {
                width: 14px;
                height: 14px;
                display: block;
            }

            .strata-profile-icon:hover {
                color: var(--st-cyan-bright);
                border-color: rgba(var(--st-accent-rgb), .58);
                background: rgba(var(--st-accent-rgb), .10);
                box-shadow: 0 0 12px rgba(var(--st-accent-rgb), .12);
                transform: translateY(-1px);
            }

            #strata-controls {
                display: grid;
                grid-template-columns: 1fr 1.18fr 1fr;
                gap: 9px;
                margin-bottom: 10px;
            }

            #strata-controls button {
                height: 44px;
                padding: 0;
                border: 1px solid var(--st-cyan);
                border-radius: 9px;
                background: rgba(2,10,12,.48);
                color: var(--st-cyan);
                cursor: pointer;
                font-size: 17px;
                transition:
                    background .14s ease,
                    box-shadow .14s ease,
                    transform .14s ease,
                    color .14s ease;
            }

            #strata-controls button:hover {
                background: rgba(var(--st-accent-rgb),.06);
                color: var(--st-cyan-bright);
                box-shadow: 0 0 12px rgba(var(--st-accent-rgb),.06);
            }

            #strata-controls button:active {
                transform: scale(.985);
            }

            #strata-play {
                font-size: 21px !important;
            }

            #strata-radio {
                display: grid;
                grid-template-columns: 30px minmax(0,1fr) 48px;
                align-items: center;
                width: 100%;
                min-height: 54px;
                margin-bottom: 5px;
                padding: 5px 6px 5px 8px;
                border: 0;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.24);
                background: transparent;
                color: var(--st-white);
                cursor: pointer;
                text-align: left;
            }

            #strata-radio:hover {
                background: rgba(var(--st-accent-rgb),.025);
            }

            .strata-radio-icon {
                color: var(--st-cyan);
                font-size: 18px;
            }

            .strata-radio-copy {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .strata-radio-label {
                color: var(--st-cyan);
                font-size: 11px;
                font-weight: 700;
                letter-spacing: .8px;
            }

            .strata-radio-sub {
                color: var(--st-muted);
                font-size: 9px;
                letter-spacing: 0;
            }

            .strata-switch {
                position: relative;
                display: block;
                width: 42px;
                height: 23px;
                justify-self: end;
                border: 1px solid rgba(var(--st-accent-rgb),.55);
                border-radius: 20px;
                background: rgba(var(--st-accent-rgb),.04);
                transition: background .18s ease, box-shadow .18s ease;
            }

            .strata-switch-knob {
                position: absolute;
                top: 3px;
                left: 3px;
                width: 15px;
                height: 15px;
                border-radius: 50%;
                background: rgba(205,238,240,.55);
                transition:
                    transform .18s ease,
                    background .18s ease,
                    box-shadow .18s ease;
            }

            #strata-radio.on .strata-switch {
                background: rgba(var(--st-accent-rgb),.15);
                box-shadow: inset 0 0 12px rgba(var(--st-accent-rgb),.08);
            }

            #strata-radio.on .strata-switch-knob {
                transform: translateX(19px);
                background: var(--st-cyan-bright);
                box-shadow: 0 0 9px rgba(var(--st-accent-rgb),.55);
            }

            #strata-visual-fronttoggle {
                display: grid;
                grid-template-columns: 30px minmax(0,1fr) 48px;
                align-items: center;
                width: 100%;
                min-height: 54px;
                margin-bottom: 5px;
                padding: 5px 6px 5px 8px;
                border: 0;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.24);
                background: transparent;
                color: var(--st-white);
                cursor: pointer;
                text-align: left;
            }

            /* v8.5.90: toggle now sits directly above the visual card —
               tighten the gap so the two read as one unit. */
            #strata-visual-fronttoggle {
                margin-top: 2px;
                margin-bottom: 0;
                border-bottom: 0;
            }

            #strata-visual-fronttoggle + #strata-utility-panel:not(.open) + #strata-visualizer {
                margin-top: 4px;
            }

            #strata-visual-fronttoggle:not(.on) {
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.20);
            }

            #strata-visual-fronttoggle:hover {
                background: rgba(var(--st-accent-rgb),.025);
            }

            #strata-visual-fronttoggle.on .strata-switch {
                background: rgba(var(--st-accent-rgb),.15);
                box-shadow: inset 0 0 12px rgba(var(--st-accent-rgb),.08);
            }

            #strata-visual-fronttoggle.on .strata-switch-knob {
                transform: translateX(19px);
                background: var(--st-cyan-bright);
                box-shadow: 0 0 9px rgba(var(--st-accent-rgb),.55);
            }

            #strata-links-toggle,
            #strata-channel-toggle {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                height: 42px;
                padding: 0 8px;
                border: 0;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.20);
                background: transparent;
                color: var(--st-cyan);
                cursor: pointer;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .8px;
            }

            #strata-links-toggle:hover,
            #strata-channel-toggle:hover {
                background: rgba(var(--st-accent-rgb),.025);
                color: var(--st-cyan-bright);
            }

            .strata-section-label {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .strata-section-icon {
                width: 17px;
                color: var(--st-cyan);
                font-size: 17px;
                font-weight: 400;
                text-align: center;
            }

            #strata-links-chevron,
            #strata-channel-chevron {
                font-size: 17px;
                font-weight: 400;
            }

            #strata-links-count,
            #strata-channel-count {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 20px;
                height: 20px;
                padding: 0 5px;
                border: 1px solid rgba(var(--st-accent-rgb),.38);
                border-radius: 10px;
                background: rgba(var(--st-accent-rgb),.05);
                color: var(--st-cyan);
                font-size: 9px;
                font-weight: 600;
                letter-spacing: 0;
            }

            #strata-links-count:empty {
                display: none;
            }

            #strata-links-body,
            #strata-channel-manager {
                display: none;
                padding: 7px 0;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.18);
            }

            #strata-links-body.open,
            #strata-channel-manager.open {
                display: block;
            }

            .strata-links-message,
            .strata-utility-note {
                padding: 8px 4px;
                color: var(--st-muted);
                font-size: 9px;
                line-height: 1.45;
            }

            .strata-link-row {
                display: grid;
                grid-template-columns: minmax(0,1fr) 32px;
                align-items: center;
                gap: 8px;
                min-height: 42px;
                padding: 0 7px;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.10);
                background: rgba(2,10,12,.32);
            }

            .strata-link-row:first-child {
                border-radius: 8px 8px 0 0;
            }

            .strata-link-row:last-child {
                border-bottom: 0;
                border-radius: 0 0 8px 8px;
            }

            .strata-link-service {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                color: var(--st-white);
                font-size: 10px;
            }

            .strata-link-source {
                margin-top: 2px;
                color: var(--st-cyan);
                font-size: 8px;
                letter-spacing: .3px;
            }

            .strata-link-open {
                width: 28px;
                height: 28px;
                padding: 0;
                border: 0;
                border-radius: 7px;
                background: transparent;
                color: var(--st-cyan);
                cursor: pointer;
                font-size: 15px;
            }

            .strata-link-open:hover {
                background: rgba(var(--st-accent-rgb),.065);
                color: var(--st-cyan-bright);
            }

            #strata-channel-list {
                max-height: 205px;
                overflow-y: auto;
            }

            .strata-channel-row {
                display: grid;
                grid-template-columns: 21px minmax(0,1fr) 28px;
                align-items: center;
                gap: 6px;
                min-height: 34px;
                padding: 0 5px;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.08);
            }

            .strata-channel-checkbox {
                width: 13px;
                height: 13px;
                margin: 0;
                accent-color: var(--st-cyan);
                cursor: pointer;
            }

            .strata-channel-name {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                color: rgba(231,249,250,.72);
                font-size: 10px;
            }

            .strata-channel-remove {
                width: 24px;
                height: 24px;
                padding: 0;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: rgba(var(--st-accent-rgb),.30);
                cursor: pointer;
                font-size: 14px;
            }

            .strata-channel-remove:hover {
                background: rgba(var(--st-accent-rgb),.055);
                color: var(--st-cyan);
            }

            .strata-channel-remove.hidden {
                visibility: hidden;
            }

            /* UTILITY DRAWER -------------------------------------- */

            #strata-utility-panel {
                display: none;
                margin-top: 8px;
                border: 1px solid rgba(var(--st-accent-rgb),.22);
                border-radius: 9px;
                background: rgba(2,10,12,.46);
                overflow: hidden;
            }

            #strata-utility-panel.open {
                display: block;
                animation: strataUtilityOpen .14s ease-out;
            }

            @keyframes strataUtilityOpen {
                from { opacity: 0; transform: translateY(3px); }
                to { opacity: 1; transform: none; }
            }

            .strata-utility-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 34px;
                padding: 0 6px 0 10px;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.13);
                color: var(--st-cyan);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 1px;
            }

            #strata-utility-body {
                padding: 7px;
            }

            .strata-metric-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 6px;
            }

            .strata-metric-card {
                min-height: 55px;
                padding: 8px;
                border: 1px solid rgba(var(--st-accent-rgb),.14);
                border-radius: 7px;
                background: rgba(var(--st-accent-rgb),.025);
            }

            .strata-metric-value {
                color: var(--st-cyan-bright);
                font-size: 14px;
                font-weight: 600;
            }

            .strata-metric-label {
                margin-top: 4px;
                color: var(--st-muted);
                font-size: 7px;
                font-weight: 700;
                letter-spacing: .75px;
            }

            .strata-stats-hero {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                gap: 8px;
                padding: 11px 10px;
                border: 1px solid rgba(var(--st-accent-rgb), .22);
                border-radius: 8px;
                background:
                    linear-gradient(
                        135deg,
                        rgba(var(--st-accent-rgb), .085),
                        rgba(var(--st-accent-rgb), .018) 58%,
                        rgba(0,0,0,.05)
                    );
                box-shadow:
                    inset 0 0 18px rgba(var(--st-accent-rgb), .025);
            }

            .strata-stats-hero-main {
                min-width: 0;
            }

            .strata-stats-hero-value {
                color: var(--st-cyan-bright);
                font-size: 22px;
                font-weight: 700;
                line-height: 1;
                letter-spacing: -.4px;
                font-variant-numeric: tabular-nums;
            }

            .strata-stats-hero-label {
                margin-top: 5px;
                color: var(--st-muted);
                font-size: 7px;
                font-weight: 800;
                letter-spacing: 1px;
            }

            .strata-stats-channel-pill {
                padding: 5px 7px;
                border: 1px solid rgba(var(--st-accent-rgb), .26);
                border-radius: 999px;
                background: rgba(var(--st-accent-rgb), .055);
                color: rgba(var(--st-accent-bright-rgb), .88);
                font-size: 7px;
                font-weight: 800;
                letter-spacing: .55px;
                white-space: nowrap;
            }

            .strata-stats-hero-sub {
                grid-column: 1 / -1;
                padding-top: 6px;
                border-top: 1px solid rgba(var(--st-accent-rgb), .10);
                color: var(--st-muted);
                font-size: 8px;
                font-weight: 650;
                letter-spacing: .25px;
            }

            .strata-stats-section-title {
                margin: 13px 2px 7px;
                color: var(--st-cyan);
                font-size: 8px;
                font-weight: 800;
                letter-spacing: 1px;
            }

            .strata-stats-session-grid .strata-metric-card {
                min-height: 52px;
            }

            .strata-stats-bars {
                display: grid;
                gap: 7px;
                padding: 9px;
                border: 1px solid rgba(var(--st-accent-rgb), .12);
                border-radius: 8px;
                background: rgba(var(--st-accent-rgb), .018);
            }

            .strata-stats-bar-row {
                min-width: 0;
            }

            .strata-stats-bar-copy {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 4px;
            }

            .strata-stats-bar-label {
                overflow: hidden;
                color: rgba(229,244,246,.68);
                font-size: 7px;
                font-weight: 750;
                letter-spacing: .45px;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .strata-stats-bar-value {
                flex: 0 0 auto;
                color: rgba(var(--st-accent-bright-rgb), .78);
                font-size: 7px;
                font-weight: 720;
                font-variant-numeric: tabular-nums;
            }

            .strata-stats-bar-track,
            .strata-stats-channel-bar {
                overflow: hidden;
                height: 3px;
                border-radius: 999px;
                background: rgba(var(--st-accent-rgb), .075);
            }

            .strata-stats-bar-fill,
            .strata-stats-channel-fill {
                height: 100%;
                min-width: 2px;
                border-radius: inherit;
                background:
                    linear-gradient(
                        90deg,
                        rgba(var(--st-accent-rgb), .52),
                        rgba(var(--st-accent-bright-rgb), .92)
                    );
                box-shadow:
                    0 0 7px rgba(var(--st-accent-rgb), .12);
            }

            .strata-stats-channel-header {
                margin-bottom: 7px;
            }

            .strata-stats-channels {
                overflow: hidden;
                border: 1px solid rgba(var(--st-accent-rgb), .12);
                border-radius: 8px;
                background: rgba(var(--st-accent-rgb), .014);
            }

            .strata-stats-channel-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) 92px;
                align-items: center;
                gap: 10px;
                min-height: 39px;
                padding: 6px 9px;
                border-bottom: 1px solid rgba(var(--st-accent-rgb), .075);
            }

            .strata-stats-channel-row:last-child {
                border-bottom: 0;
            }

            .strata-stats-channel-row.disabled {
                opacity: .40;
            }

            .strata-stats-channel-copy {
                display: grid;
                min-width: 0;
                gap: 2px;
            }

            .strata-stats-channel-name {
                overflow: hidden;
                color: rgba(241,250,251,.84);
                font-size: 8px;
                font-weight: 720;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .strata-stats-channel-meta {
                overflow: hidden;
                color: var(--st-muted);
                font-size: 7px;
                font-weight: 620;
                white-space: nowrap;
                text-overflow: ellipsis;
                font-variant-numeric: tabular-nums;
            }

            .strata-stats-channel-bar {
                width: 92px;
            }

            .strata-library-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 7px;
                margin: 6px 0 8px;
            }

            .strata-library-action {
                min-height: 35px;
                padding: 0 9px;
                border: 1px solid rgba(var(--st-accent-rgb),.30);
                border-radius: 7px;
                background: rgba(var(--st-accent-rgb),.035);
                color: var(--st-cyan);
                cursor: pointer;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: .55px;
            }

            .strata-library-action:hover {
                border-color: var(--st-cyan);
                background: rgba(var(--st-accent-rgb),.075);
                box-shadow: 0 0 12px rgba(var(--st-accent-rgb),.045);
            }

            .strata-library-playlist-status {
                display: grid;
                grid-template-columns: minmax(0,1fr) auto;
                align-items: center;
                gap: 8px;
                margin: 0 0 8px;
                padding: 8px;
                border: 1px solid rgba(var(--st-accent-rgb),.22);
                border-radius: 7px;
                background: rgba(var(--st-accent-rgb),.035);
            }

            .strata-library-playlist-copy {
                display: flex;
                min-width: 0;
                flex-direction: column;
                gap: 3px;
            }

            .strata-library-playlist-title {
                overflow: hidden;
                color: var(--st-cyan-bright);
                font-size: 11px;
                font-weight: 700;
                letter-spacing: .45px;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .strata-library-playlist-sub {
                overflow: hidden;
                color: var(--st-muted);
                font-size: 8px;
                font-weight: 650;
                letter-spacing: .35px;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .strata-library-return {
                min-height: 29px;
                padding: 0 9px;
                border: 1px solid rgba(var(--st-accent-rgb),.25);
                border-radius: 6px;
                background: transparent;
                color: var(--st-cyan);
                cursor: pointer;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .55px;
            }

            .strata-library-return:hover {
                border-color: var(--st-cyan);
                background: rgba(var(--st-accent-rgb),.055);
            }

            .strata-library-list {
                max-height: 270px;
                overflow-x: hidden;
                overflow-y: auto;
                overscroll-behavior: contain;
                scrollbar-width: thin;
                scrollbar-color: rgba(var(--st-accent-rgb),.38) transparent;
                border: 1px solid rgba(var(--st-accent-rgb),.12);
                border-radius: 7px;
            }

            .strata-library-list::-webkit-scrollbar {
                width: 6px;
            }

            .strata-library-list::-webkit-scrollbar-track {
                background: transparent;
            }

            .strata-library-list::-webkit-scrollbar-thumb {
                border-radius: 999px;
                background: rgba(var(--st-accent-rgb),.30);
            }

            .strata-library-list::-webkit-scrollbar-thumb:hover {
                background: rgba(var(--st-accent-rgb),.52);
            }

            .strata-library-track {
                display: grid;
                grid-template-columns: minmax(0,1fr) 18px;
                align-items: center;
                width: 100%;
                min-height: 41px;
                padding: 6px 8px;
                border: 0;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.08);
                background: transparent;
                color: var(--st-white);
                cursor: pointer;
                text-align: left;
            }

            .strata-library-track:last-child {
                border-bottom: 0;
            }

            .strata-library-track:hover {
                background: rgba(var(--st-accent-rgb),.035);
            }

            .strata-library-track.playing {
                background: rgba(var(--st-accent-rgb),.06);
                box-shadow: inset 2px 0 0 rgba(var(--st-accent-rgb),.75);
            }

            .strata-library-track-copy {
                display: flex;
                flex-direction: column;
                min-width: 0;
                gap: 2px;
            }

            .strata-library-track-title {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                font-size: 9px;
            }

            .strata-library-track-channel {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                color: var(--st-cyan);
                font-size: 8px;
            }

            .strata-library-track-arrow {
                color: var(--st-cyan);
                text-align: right;
                font-size: 17px;
            }

            .strata-skin-header {
                margin-top: 0;
            }

            .strata-skin-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 6px;
                margin: 8px 0 13px;
            }

            .strata-skin-button {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                min-width: 0;
                height: 34px;
                gap: 6px;
                padding: 0 7px;
                border: 1px solid rgba(var(--st-accent-rgb), .20);
                border-radius: 8px;
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb), .055),
                        rgba(0,0,0,.16)
                    );
                color: rgba(244,252,253,.72);
                cursor: pointer;
                transition:
                    border-color .14s ease,
                    background .14s ease,
                    box-shadow .14s ease,
                    transform .14s ease;
            }

            .strata-skin-button:hover {
                border-color: rgba(var(--st-accent-rgb), .48);
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb), .10),
                        rgba(0,0,0,.14)
                    );
            }

            .strata-skin-button.active {
                border-color: var(--st-cyan-bright);
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb), .17),
                        rgba(var(--st-accent-rgb), .055)
                    );
                box-shadow:
                    0 0 10px rgba(var(--st-accent-rgb), .10),
                    inset 0 0 0 1px rgba(var(--st-accent-bright-rgb), .08);
            }

            .strata-skin-swatch {
                flex: 0 0 auto;
                width: 9px;
                height: 9px;
                border-radius: 50%;
            }

            .strata-skin-label {
                min-width: 0;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                font-size: 7px;
                font-weight: 760;
                letter-spacing: .35px;
            }

            .strata-settings-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 34px;
                padding: 0 5px;
                border-bottom: 1px solid rgba(var(--st-accent-rgb),.08);
                color: rgba(231,249,250,.72);
                font-size: 9px;
            }

            .strata-settings-value {
                color: var(--st-cyan);
            }

            .strata-settings-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin: 12px 0 10px;
            }

            .strata-settings-action {
                min-width: 0;
                height: 36px;
                padding: 0 10px;
                border: 1px solid rgba(var(--st-accent-rgb),.34);
                border-radius: 9px;
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb),.11),
                        rgba(var(--st-accent-rgb),.045)
                    );
                color: var(--st-cyan-bright);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: .65px;
                cursor: pointer;
                transition:
                    background .14s ease,
                    border-color .14s ease,
                    box-shadow .14s ease;
            }

            .strata-settings-action:hover {
                border-color: rgba(var(--st-accent-rgb),.72);
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb),.17),
                        rgba(var(--st-accent-rgb),.075)
                    );
                box-shadow: 0 0 12px rgba(var(--st-accent-rgb),.08);
            }

            .strata-settings-action:disabled {
                opacity: .5;
                cursor: default;
            }

            .strata-about-mark {
                padding: 9px 4px 3px;
                color: var(--st-cyan-bright);
                font-size: 15px;
                font-weight: 760;
                letter-spacing: 4px;
            }


            .strata-diagnostics-row {
                display: flex;
                flex-wrap: wrap;
                gap: 4px 14px;
                margin-top: 10px;
                padding-top: 8px;
                border-top: 1px solid rgba(var(--st-accent-rgb), .10);
            }

            .strata-creator-link {
                display: inline-flex;
                align-items: center;
                width: max-content;
                margin: 5px 3px 1px;
                padding: 0;
                border: 0;
                background: transparent;
                color: rgba(var(--st-accent-bright-rgb), .70);
                font-size: 8px;
                font-weight: 760;
                letter-spacing: .85px;
                text-decoration: none;
                cursor: pointer;
                opacity: .76;
                transition:
                    color .14s ease,
                    opacity .14s ease,
                    transform .14s ease;
            }

            .strata-creator-link:hover {
                color: var(--st-cyan-bright);
                opacity: 1;
                transform: translateX(1px);
            }

            .strata-creator-link:focus-visible {
                outline: 1px solid var(--st-cyan-bright);
                outline-offset: 3px;
                border-radius: 2px;
            }


            .strata-support-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 7px;
                margin-top: 9px;
                padding: 12px 10px 11px;
                border: 1px solid rgba(var(--st-accent-rgb),.25);
                border-radius: 11px;
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb),.045),
                        rgba(var(--st-accent-rgb),.018)
                    );
            }

            .strata-support-title {
                color: var(--st-cyan-bright);
                font-size: 10px;
                font-weight: 760;
                letter-spacing: 1.25px;
            }

            .strata-support-copy {
                max-width: 250px;
                color: rgba(225,246,247,.63);
                font-size: 9px;
                line-height: 1.45;
                text-align: center;
            }

            .strata-paypal-link {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 36px;
                margin-top: 2px;
                padding: 0 16px;
                border: 1px solid rgba(var(--st-accent-rgb), .55);
                border-radius: 18px;
                background: rgba(var(--st-accent-rgb), .1);
                color: var(--st-cyan-bright);
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .6px;
                text-decoration: none;
                cursor: pointer;
                transition: background .15s ease, border-color .15s ease;
            }
            .strata-paypal-link:hover,
            .strata-paypal-link:focus-visible {
                background: rgba(var(--st-accent-rgb), .2);
                border-color: rgba(var(--st-accent-rgb), .85);
                outline: none;
            }
            /* AUDIO VISUAL ENGINE -------------------------------- */

            #strata-visualizer {
                position: relative;
                isolation: isolate;
                overflow: hidden;
                width: 100%;
                height: clamp(210px, 30vh, 330px);
                min-height: 210px;
                margin: 10px 0 2px;
                border: 1px solid rgba(var(--st-accent-rgb), .18);
                border-radius: 12px;
                background:
                    radial-gradient(
                        circle at 50% 48%,
                        rgba(var(--st-accent-rgb), .075),
                        transparent 50%
                    ),
                    linear-gradient(
                        180deg,
                        rgba(2,10,12,.82),
                        rgba(1,6,8,.96)
                    );
                box-shadow:
                    inset 0 0 34px rgba(var(--st-accent-rgb), .045),
                    0 0 22px rgba(var(--st-accent-rgb), .040);
            }

            #strata-visualizer[hidden] {
                display: none;
            }

            #strata-visualizer:fullscreen,
            #strata-visualizer.strata-visual-fullscreen {
                width: 100vw;
                height: 100vh;
                min-height: 0;
                margin: 0;
                border: 0;
                border-radius: 0;
                background:
                    radial-gradient(
                        circle at 50% 48%,
                        rgba(var(--st-accent-rgb), .075),
                        transparent 50%
                    ),
                    linear-gradient(
                        180deg,
                        rgba(2,10,12,.92),
                        rgba(1,6,8,1)
                    );
                box-shadow: none;
                cursor: default;
            }

            #strata-visualizer:fullscreen .strata-visualizer-hud,
            #strata-visualizer.strata-visual-fullscreen .strata-visualizer-hud {
                top: 18px;
                left: 20px;
                right: 20px;
            }

            #strata-visualizer:fullscreen #strata-visualizer-meter,
            #strata-visualizer.strata-visual-fullscreen #strata-visualizer-meter {
                left: 20px;
                bottom: 17px;
            }

            #strata-visualizer:fullscreen .strata-visual-reactivity-switch,
            #strata-visualizer.strata-visual-fullscreen .strata-visual-reactivity-switch {
                right: 18px;
                bottom: 15px;
            }

            #strata-visualizer::before {
                content: '';
                position: absolute;
                inset: 0;
                z-index: 2;
                pointer-events: none;
                background:
                    radial-gradient(
                        ellipse at center,
                        transparent 38%,
                        rgba(0,0,0,.20) 100%
                    );
            }

            #strata-visualizer::after {
                content: '';
                position: absolute;
                inset: 0;
                z-index: 3;
                pointer-events: none;
                opacity: .21;
                background:
                    repeating-linear-gradient(
                        180deg,
                        transparent 0,
                        transparent 3px,
                        rgba(0,0,0,.20) 4px
                    );
            }

            #strata-visualizer-canvas {
                position: absolute;
                inset: 0;
                z-index: 1;
                display: block;
                width: 100%;
                height: 100%;
            }

            .strata-visualizer-hud {
                position: absolute;
                z-index: 4;
                top: 10px;
                left: 11px;
                right: 11px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                pointer-events: none;
            }

            .strata-visualizer-hud-right {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                pointer-events: none;
            }

            .strata-visual-mode-switch {
                display: inline-flex;
                align-items: center;
                overflow: hidden;
                height: 19px;
                border: 1px solid rgba(var(--st-accent-rgb), .18);
                border-radius: 999px;
                background: rgba(1, 8, 10, .58);
                box-shadow:
                    inset 0 0 8px rgba(var(--st-accent-rgb), .025);
                pointer-events: auto;
            }

            .strata-visual-mode-arrow {
                display: inline-grid;
                place-items: center;
                width: 20px;
                height: 18px;
                min-width: 20px;
                padding: 0;
                border: 0;
                border-radius: 0;
                background: transparent;
                color: rgba(var(--st-accent-bright-rgb), .58);
                font-size: 13px;
                font-weight: 760;
                line-height: 1;
                cursor: pointer;
                transition:
                    color .12s ease,
                    background .12s ease,
                    text-shadow .12s ease;
            }

            .strata-visual-mode-arrow + .strata-visual-mode-arrow {
                border-left: 1px solid rgba(var(--st-accent-rgb), .12);
            }

            .strata-visual-mode-arrow:hover {
                background: rgba(var(--st-accent-rgb), .08);
                color: var(--st-cyan-bright);
                text-shadow:
                    0 0 7px rgba(var(--st-accent-rgb), .55);
            }

            .strata-visual-mode-arrow:active {
                background: rgba(var(--st-accent-rgb), .14);
            }

            .strata-visualizer-brand {
                display: inline-flex;
                align-items: center;
                color: rgba(var(--st-accent-bright-rgb), .77);
                font-size: 8px;
                font-weight: 800;
                letter-spacing: 1.22px;
            }

            .strata-visualizer-brand::before {
                content: '';
                width: 5px;
                height: 5px;
                margin-right: 7px;
                border-radius: 50%;
                background: var(--st-cyan-bright);
                box-shadow:
                    0 0 8px rgba(var(--st-accent-rgb), .68);
            }

            #strata-visualizer-mode {
                padding: 3px 6px;
                border: 1px solid rgba(var(--st-accent-rgb), .17);
                border-radius: 999px;
                background: rgba(var(--st-accent-rgb), .026);
                color: rgba(var(--st-accent-bright-rgb), .68);
                font-size: 7px;
                font-weight: 760;
                letter-spacing: .6px;
            }

            #strata-visualizer-mode[data-mode="audio"] {
                border-color: rgba(var(--st-accent-rgb), .32);
                color: var(--st-cyan-bright);
                box-shadow:
                    0 0 10px rgba(var(--st-accent-rgb), .055);
            }

            #strata-visualizer-mode[data-mode="paused"] {
                opacity: .46;
            }

            #strata-visualizer-meter {
                position: absolute;
                z-index: 4;
                left: 11px;
                bottom: 9px;
                color: rgba(201,225,228,.38);
                font-size: 6px;
                font-weight: 680;
                letter-spacing: .72px;
                pointer-events: none;
                font-variant-numeric: tabular-nums;
            }

            .strata-visual-reactivity-switch {
                position: absolute;
                z-index: 5;
                right: 9px;
                bottom: 7px;
                display: inline-flex;
                align-items: center;
                overflow: hidden;
                height: 21px;
                border: 1px solid rgba(var(--st-accent-rgb), .16);
                border-radius: 999px;
                background: rgba(1, 8, 10, .62);
                box-shadow:
                    inset 0 0 8px rgba(var(--st-accent-rgb), .025);
                pointer-events: auto;
            }

            .strata-visual-reactivity-pill {
                display: inline-grid;
                place-items: center;
                min-width: 39px;
                height: 20px;
                padding: 0 7px;
                border: 0;
                border-radius: 0;
                background: transparent;
                color: rgba(214,237,239,.38);
                font-size: 6px;
                font-weight: 780;
                line-height: 1;
                letter-spacing: .48px;
                cursor: pointer;
                transition:
                    color .12s ease,
                    background .12s ease,
                    text-shadow .12s ease;
            }

            .strata-visual-reactivity-pill + .strata-visual-reactivity-pill {
                border-left: 1px solid rgba(var(--st-accent-rgb), .10);
            }

            .strata-visual-reactivity-pill:hover {
                color: rgba(var(--st-accent-bright-rgb), .76);
                background: rgba(var(--st-accent-rgb), .045);
            }

            .strata-visual-reactivity-pill.active {
                color: var(--st-cyan-bright);
                background: rgba(var(--st-accent-rgb), .095);
                text-shadow:
                    0 0 7px rgba(var(--st-accent-rgb), .38);
            }

            .strata-visual-settings-header {
                margin-top: 12px;
            }

            .strata-visual-setting {
                display: grid;
                grid-template-columns: minmax(0,1fr) auto;
                align-items: center;
                gap: 10px;
                width: 100%;
                min-height: 48px;
                margin: 7px 0 9px;
                padding: 7px 9px;
                border: 1px solid rgba(var(--st-accent-rgb), .16);
                border-radius: 9px;
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb), .035),
                        rgba(0,0,0,.07)
                    );
                color: inherit;
                cursor: pointer;
            }

            .strata-visual-setting.on,
            .strata-visual-setting:hover {
                border-color: rgba(var(--st-accent-rgb), .34);
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb), .074),
                        rgba(var(--st-accent-rgb), .018)
                    );
            }

            .strata-visual-setting-copy {
                display: grid;
                gap: 3px;
                min-width: 0;
                text-align: left;
            }

            .strata-visual-setting-title {
                color: var(--st-cyan-bright);
                font-size: 9px;
                font-weight: 790;
                letter-spacing: .8px;
            }

            .strata-visual-setting-sub {
                overflow: hidden;
                color: var(--st-muted);
                font-size: 7px;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .strata-visual-setting.on .strata-switch {
                background: rgba(var(--st-accent-rgb),.15);
                box-shadow:
                    inset 0 0 12px rgba(var(--st-accent-rgb),.08);
            }

            .strata-visual-setting.on .strata-switch-knob {
                transform: translateX(19px);
                background: var(--st-cyan-bright);
                box-shadow:
                    0 0 9px rgba(var(--st-accent-rgb),.55);
            }

            .strata-visual-option-label {
                margin: 10px 2px 6px;
                color: rgba(var(--st-accent-bright-rgb), .70);
                font-size: 7px;
                font-weight: 800;
                letter-spacing: .92px;
            }

            .strata-visual-cycle-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 5px;
            }

            .strata-visual-cycle-button {
                min-width: 0;
                min-height: 25px;
                padding: 0 5px;
                border: 1px solid rgba(var(--st-accent-rgb), .11);
                border-radius: 6px;
                background: rgba(var(--st-accent-rgb), .012);
                color: rgba(201,225,228,.31);
                font-size: 6px;
                font-weight: 760;
                letter-spacing: .42px;
                cursor: pointer;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                transition:
                    border-color .12s ease,
                    color .12s ease,
                    background .12s ease,
                    opacity .12s ease;
            }

            .strata-visual-cycle-button:hover {
                border-color: rgba(var(--st-accent-rgb), .30);
                color: rgba(var(--st-accent-bright-rgb), .70);
            }

            .strata-visual-cycle-button.active {
                border-color: rgba(var(--st-accent-rgb), .36);
                background: rgba(var(--st-accent-rgb), .060);
                color: var(--st-cyan-bright);
                box-shadow:
                    inset 0 0 8px rgba(var(--st-accent-rgb), .035);
            }

            .strata-visual-cycle-button.active::before {
                content: '✓ ';
                opacity: .72;
            }


            /* TRACK ANALYSIS -------------------------------------- */

            #strata-track-analysis {
                width: 100%;
                margin: 8px 0 1px;
                padding: 8px 10px 7px;
                border: 1px solid rgba(var(--st-accent-rgb), .16);
                border-radius: 10px;
                background:
                    linear-gradient(
                        180deg,
                        rgba(var(--st-accent-rgb), .028),
                        rgba(0,0,0,.08)
                    );
                box-shadow:
                    inset 0 1px 0 rgba(var(--st-accent-bright-rgb), .025);
            }

            #strata-track-analysis[hidden] {
                display: none;
            }

            .strata-analysis-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-height: 14px;
                margin-bottom: 6px;
            }

            .strata-analysis-title {
                color: rgba(var(--st-accent-bright-rgb), .74);
                font-size: 7px;
                font-weight: 800;
                letter-spacing: 1.12px;
            }

            .strata-analysis-state {
                padding: 2px 5px;
                border: 1px solid rgba(var(--st-accent-rgb), .13);
                border-radius: 999px;
                color: rgba(214,237,239,.42);
                font-size: 6px;
                font-weight: 720;
                letter-spacing: .54px;
                white-space: nowrap;
            }

            .strata-analysis-state[data-state="active"] {
                border-color: rgba(var(--st-accent-rgb), .23);
                color: rgba(var(--st-accent-bright-rgb), .66);
            }

            .strata-analysis-grid {
                display: grid;
                grid-template-columns:
                    .90fr
                    .80fr
                    1.12fr
                    .90fr;
                gap: 5px;
            }

            .strata-analysis-metric {
                display: grid;
                min-width: 0;
                gap: 2px;
                padding: 5px 6px 4px;
                border-left: 1px solid rgba(var(--st-accent-rgb), .11);
                background:
                    linear-gradient(
                        90deg,
                        rgba(var(--st-accent-rgb), .018),
                        transparent
                    );
            }

            .strata-analysis-metric:first-child {
                border-left-color: transparent;
            }

            .strata-analysis-label {
                color: rgba(201,225,228,.38);
                font-size: 6px;
                font-weight: 730;
                letter-spacing: .70px;
            }

            .strata-analysis-value {
                overflow: hidden;
                color: rgba(244,252,253,.88);
                font-size: 13px;
                font-weight: 720;
                line-height: 1.08;
                letter-spacing: .15px;
                white-space: nowrap;
                text-overflow: ellipsis;
                font-variant-numeric: tabular-nums;
            }

            #strata-track-analysis[data-ready="true"]
            .strata-analysis-value {
                color: var(--st-cyan-bright);
                text-shadow:
                    0 0 8px rgba(var(--st-accent-rgb), .12);
            }

            .strata-analysis-footer {
                display: flex;
                align-items: center;
                gap: 5px;
                min-width: 0;
                margin-top: 6px;
                padding-top: 5px;
                border-top: 1px solid rgba(var(--st-accent-rgb), .10);
                color: rgba(201,225,228,.34);
                font-size: 6px;
                font-weight: 680;
                letter-spacing: .52px;
                white-space: nowrap;
            }

            .strata-analysis-separator {
                opacity: .48;
            }

            .strata-analysis-estimate {
                overflow: hidden;
                margin-left: auto;
                color: rgba(var(--st-accent-rgb), .34);
                text-overflow: ellipsis;
            }


            /* FOOTER ---------------------------------------------- */

            #strata-footer {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 2px;
                margin-top: 9px;
                padding-top: 8px;
                border-top: 1px solid rgba(var(--st-accent-rgb),.22);
            }

            .strata-footer-tab {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 4px;
                min-width: 0;
                height: 48px;
                padding: 0;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: rgba(205,238,240,.57);
                cursor: pointer;
            }

            .strata-footer-tab:hover,
            .strata-footer-tab.active {
                background: rgba(var(--st-accent-rgb),.035);
                color: var(--st-cyan);
            }

            .strata-footer-icon {
                color: currentColor;
                font-size: 17px;
                line-height: 1;
            }

            .strata-footer-label {
                overflow: hidden;
                max-width: 100%;
                color: currentColor;
                font-size: 7px;
                font-weight: 650;
                letter-spacing: .55px;
                text-overflow: ellipsis;
            }


            /* =================================================
               BIG PLAYER READABILITY BOOST — v8.5.28

               Text only: approximately +2px throughout the
               expanded STRATA panel. Icons, geometry, dragging,
               resizing and player mechanics are untouched.
               ================================================= */

            #strata-title { font-size: 22px; }
            .strata-eyebrow { font-size: 11px; }
            #strata-now-title { font-size: 15px; }
            #strata-now-channel { font-size: 12px; }


            .strata-radio-label { font-size: 13px; }
            .strata-radio-sub { font-size: 11px; }

            #strata-links-toggle,
            #strata-channel-toggle { font-size: 12px; }

            #strata-links-count,
            #strata-channel-count { font-size: 11px; }

            .strata-links-message,
            .strata-utility-note { font-size: 11px; }

            .strata-link-service { font-size: 12px; }
            .strata-link-source { font-size: 10px; }
            .strata-channel-name { font-size: 12px; }

            .strata-utility-header { font-size: 11px; }
            .strata-metric-value { font-size: 16px; }
            .strata-metric-label { font-size: 9px; }
            .strata-stats-hero-value { font-size: 25px; }
            .strata-stats-hero-label,
            .strata-stats-section-title { font-size: 10px; }
            .strata-stats-channel-pill,
            .strata-stats-bar-label,
            .strata-stats-bar-value,
            .strata-stats-channel-meta { font-size: 9px; }
            .strata-stats-channel-name { font-size: 10px; }

            .strata-library-track-title { font-size: 11px; }
            .strata-library-track-channel { font-size: 10px; }
            .strata-settings-row { font-size: 11px; }
            .strata-skin-label { font-size: 8px; }
            .strata-settings-action { font-size: 11px; }

            .strata-about-mark { font-size: 17px; }
            .strata-support-title { font-size: 12px; }
            .strata-support-copy { font-size: 11px; }
            .strata-support-hint { font-size: 10px; }
            .strata-footer-label { font-size: 9px; }
            .strata-visualizer-brand { font-size: 10px; }
            #strata-visualizer-mode { font-size: 9px; }
            #strata-visualizer-meter { font-size: 8px; }
            .strata-visual-setting-title { font-size: 11px; }
            .strata-visual-setting-sub { font-size: 9px; }
            .strata-visual-option-label { font-size: 9px; }
            .strata-visual-cycle-button { font-size: 8px; }
            .strata-visual-reactivity-pill { font-size: 7px; }
            .strata-analysis-title { font-size: 9px; }
            .strata-analysis-state { font-size: 8px; }
            .strata-analysis-label { font-size: 8px; }
            .strata-analysis-value { font-size: 15px; }
            .strata-analysis-footer { font-size: 8px; }
            .strata-creator-link { font-size: 9px; }


            /* =================================================
               v8.5.77 CALM PASS

               Rations the accent colour to live/actionable
               elements, softens most internal borders to single
               hairlines, and quiets static labels to a muted
               grey-blue. Skins still work: every rule below reads
               the same --st-accent-rgb variable, so all six accent
               colours flow through unchanged. Layout, geometry,
               dragging, resizing and playback are untouched — this
               is colour, border and weight only.
               ================================================= */

            #strata-root {
                --st-quiet: rgba(190, 214, 220, .40);
                --st-quiet-strong: rgba(205, 228, 233, .58);
                --st-hair: rgba(150, 190, 200, .10);
            }
            /* v8.6.0: neutral / warm quiet tones for the new skins */
            #strata-root[data-skin="black"] {
                --st-quiet: rgba(205, 205, 205, .42);
                --st-quiet-strong: rgba(225, 225, 225, .6);
                --st-hair: rgba(200, 200, 200, .1);
            }

            /* Static section eyebrows / labels drop to quiet grey-blue.
               Accent is no longer spent on headings. */
            .strata-eyebrow,
            .strata-radio-sub,
            .strata-analysis-label,
            .strata-analysis-title,
            .strata-metric-label,
            .strata-stats-hero-label,
            .strata-stats-section-title,
            .strata-visual-option-label,
            .strata-utility-header {
                color: var(--st-quiet) !important;
            }

            /* Section toggles (Release links / Channels): the row label
               is quiet; only the count badge and chevron stay accent. */
            #strata-links-toggle,
            #strata-channel-toggle {
                color: var(--st-quiet-strong) !important;
            }

            /* Now Playing: promote the track title, quiet the channel
               slightly so the title clearly leads. */
            #strata-now-title {
                font-weight: 600;
            }

            /* Radio / Visual labels: primary text weight, not accent. */
            .strata-radio-label {
                color: rgba(230, 244, 247, .90) !important;
            }

            /* Soften the heavy per-card borders to hairlines. The
               boxes-inside-boxes feel comes from these; a single faint
               edge keeps grouping without the noise. */
            #strata-now,
            #strata-release-info,
            #strata-track-analysis,
            #strata-utility-panel,
            .strata-metric-card,
            .strata-stats-bars,
            .strata-stats-channels,
            .strata-library-list {
                border-color: var(--st-hair) !important;
                box-shadow: none !important;
            }

            /* Release-info internal borders and link-row dividers down to
               near-invisible hairlines. */
            #strata-release-info {
                background: rgba(var(--st-accent-rgb), .014) !important;
            }
            .strata-link-row {
                border-color: var(--st-hair) !important;
            }
            .strata-link-row {
                background: transparent !important;
            }

            /* Link detail line: quiet unless it's the available format.
               (Availability wording is set in JS; this just calms the
               default caption colour.) */
            .strata-link-source {
                color: var(--st-quiet) !important;
            }

            /* Transport: keep only Play/Pause as the accent control.
               Prev / Next read as quiet outlines so the eye lands on
               the primary action. */
            #strata-controls button {
                border-color: rgba(var(--st-accent-rgb), .20) !important;
                color: var(--st-quiet-strong) !important;
            }
            #strata-play {
                border-color: rgba(var(--st-accent-rgb), .48) !important;
                color: rgb(var(--st-accent-bright-rgb)) !important;
                background: rgba(var(--st-accent-rgb), .06) !important;
            }

            /* Settings skin picker: the six colours already carry meaning;
               the button frames just add noise. Quiet their borders. */
            .strata-skin-button {
                border-color: var(--st-hair) !important;
                background: transparent !important;
            }
            .strata-skin-button.active {
                border-color: rgba(var(--st-accent-rgb), .55) !important;
                background: rgba(var(--st-accent-rgb), .05) !important;
            }
            .strata-skin-label {
                color: var(--st-quiet-strong) !important;
            }

            /* Visual Lab active-visuals grid: the 4x4 tick wall is the
               single busiest block. Strip the per-button boxes; an active
               visual is shown by accent text + underline, an inactive one
               is simply dim. Same toggle behaviour. */
            .strata-visual-cycle-button {
                border: 0 !important;
                border-radius: 0 !important;
                background: transparent !important;
                border-bottom: 1.5px solid transparent !important;
                color: var(--st-quiet) !important;
                min-height: 22px !important;
            }
            .strata-visual-cycle-button.active {
                border-bottom-color: rgba(var(--st-accent-rgb), .55) !important;
                background: transparent !important;
                color: rgba(230, 244, 247, .88) !important;
                box-shadow: none !important;
            }
            .strata-visual-cycle-button.active::before {
                content: '' !important;
            }

            /* Stats age bars: mute the fill so data reads without glowing. */
            .strata-stats-bar-fill,
            .strata-stats-channel-fill {
                background: rgba(var(--st-accent-rgb), .42) !important;
                box-shadow: none !important;
            }
            .strata-stats-hero-value,
            .strata-metric-value {
                color: rgba(244, 252, 253, .92) !important;
                text-shadow: none !important;
            }
            .strata-stats-channel-pill {
                color: rgb(var(--st-accent-bright-rgb)) !important;
                background: transparent !important;
                border-color: rgba(var(--st-accent-rgb), .28) !important;
            }

            /* Library: Play all is the one accent action; Shuffle is quiet. */
            .strata-library-action {
                border-color: var(--st-hair) !important;
                background: transparent !important;
                color: var(--st-quiet-strong) !important;
            }
            .strata-library-action:first-child {
                border-color: rgba(var(--st-accent-rgb), .40) !important;
                background: rgba(var(--st-accent-rgb), .05) !important;
                color: rgb(var(--st-accent-bright-rgb)) !important;
            }
            .strata-library-track {
                border-color: var(--st-hair) !important;
            }

            /* Track Analysis: quiet the metric frame lines; the VALUES
               stay bright when ready (existing data-ready rule handles it). */
            .strata-analysis-metric {
                border-left-color: var(--st-hair) !important;
                background: transparent !important;
            }
            .strata-analysis-footer {
                border-top-color: var(--st-hair) !important;
            }

            /* The lone wordmark dot: make it a deliberate status light,
               not a stray character. Dim by default. */
            #strata-activity {
                background: rgba(var(--st-accent-rgb), .30) !important;
            }

            /* =================================================
               v8.5.78 HERO — Now Playing + release identity

               The track title is the hero; artist / label / date sit on
               one quiet line beneath it, and format availability shows as
               pills. Replaces the old five-row release-info grid.
               ================================================= */

            #strata-now-title {
                font-size: 20px !important;
                font-weight: 600 !important;
                line-height: 1.22 !important;
                -webkit-line-clamp: 2 !important;
            }

            /* The channel handle under the title stays quiet accent. */
            #strata-now-channel {
                color: rgba(var(--st-accent-rgb), .78) !important;
                font-size: 11px !important;
            }

            /* Release-info container: no border, no card — it's part of the
               hero now, sitting just under Now Playing. */
            #strata-release-info {
                border: 0 !important;
                background: transparent !important;
                padding: 2px 13px 6px !important;
                margin-bottom: 4px !important;
            }

            .strata-hero-meta {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                line-height: 1.5;
            }

            .strata-hero-artist {
                color: rgba(230, 244, 247, .92);
                font-weight: 500;
            }

            .strata-hero-part {
                color: rgba(190, 214, 220, .60);
            }

            .strata-hero-dot {
                color: rgba(140, 170, 178, .40);
            }

            .strata-hero-meta .strata-profile-icon {
                width: 19px;
                height: 19px;
            }
            .strata-hero-meta .strata-profile-icon svg {
                width: 12px;
                height: 12px;
            }

            .strata-hero-pills {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 10px;
            }

            .strata-pill {
                font-size: 10px;
                letter-spacing: .04em;
                border-radius: 5px;
                padding: 3px 9px;
                border: 1px solid transparent;
            }

            .strata-pill-on {
                color: rgb(var(--st-accent-bright-rgb));
                border-color: rgba(var(--st-accent-rgb), .40);
                background: rgba(var(--st-accent-rgb), .06);
            }

            .strata-pill-link {
                color: rgb(var(--st-accent-bright-rgb));
                border-color: rgba(var(--st-accent-rgb), .28);
                border-style: dashed;
                background: transparent;
                text-decoration: none;
                cursor: pointer;
            }

            .strata-pill-link:hover {
                border-style: solid;
                background: rgba(var(--st-accent-rgb), .08);
            }

            .strata-pill-off {
                color: rgba(190, 214, 220, .48);
                border-color: rgba(150, 190, 200, .18);
                background: transparent;
            }

            /* v8.5.81 ------------------------------------------- */

            .strata-hero-link {
                cursor: pointer;
                border-bottom: 1px dotted transparent;
                transition: color .14s ease, border-color .14s ease;
            }

            .strata-hero-link:hover {
                color: rgb(var(--st-accent-bright-rgb)) !important;
                border-bottom-color: rgba(var(--st-accent-rgb), .55);
            }

            #strata-focus-bar {
                display: none;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin: 0 0 9px;
                padding: 5px 6px 5px 11px;
                border: 1px solid rgba(var(--st-accent-rgb), .38);
                border-radius: 8px;
                background: rgba(var(--st-accent-rgb), .06);
            }

            #strata-focus-bar.visible {
                display: flex;
            }

            #strata-focus-bar.notice {
                border-color: rgba(150, 190, 200, .22);
                background: transparent;
            }

            .strata-focus-copy {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                color: rgb(var(--st-accent-bright-rgb));
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .6px;
            }

            #strata-focus-bar.notice .strata-focus-copy {
                color: var(--st-quiet-strong);
            }

            .strata-focus-exit {
                flex: 0 0 auto;
                width: 24px;
                height: 24px;
                padding: 0;
                border: 0;
                border-radius: 6px;
                background: transparent;
                color: var(--st-quiet-strong);
                cursor: pointer;
                font-size: 16px;
            }

            .strata-focus-exit:hover {
                background: rgba(var(--st-accent-rgb), .08);
                color: rgb(var(--st-accent-bright-rgb));
            }

            .strata-mode-row {
                margin-bottom: 4px;
            }

            .strata-mode-group {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .strata-mode-pill {
                min-height: 26px;
                padding: 0 11px;
                border: 1px solid var(--st-hair);
                border-radius: 6px;
                background: transparent;
                color: var(--st-quiet-strong);
                cursor: pointer;
                font-size: 9px;
                font-weight: 760;
                letter-spacing: .55px;
            }

            .strata-mode-pill:hover {
                border-color: rgba(var(--st-accent-rgb), .35);
            }

            .strata-mode-pill.active {
                border-color: rgba(var(--st-accent-rgb), .55);
                background: rgba(var(--st-accent-rgb), .06);
                color: rgb(var(--st-accent-bright-rgb));
            }

            .strata-fav-flash {
                animation: strataFavFlash .6s ease-out;
            }

            @keyframes strataFavFlash {
                0% { transform: scale(1); }
                35% {
                    transform: scale(1.35);
                    text-shadow: 0 0 14px rgba(var(--st-accent-rgb), .8);
                }
                100% { transform: scale(1); }
            }

            /* Settings visual list: flow the names as a wrapped inline list
               rather than a rigid 4x4 grid of boxes. Combined with the
               calm-pass underline styling this reads as a calm list where
               active = accent underline, inactive = dim. */
            .strata-visual-cycle-grid {
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 6px 14px !important;
            }
            .strata-visual-cycle-button {
                min-width: 0 !important;
                width: auto !important;
                padding: 3px 1px !important;
                text-align: left !important;
            }
        
            /* 909 — "Contrast" look, chosen in the 909 skin lab (v8.6.2) */
html #strata-root[data-skin="909"] {
  --st-accent-rgb: 255, 138, 61;
  --st-accent-bright-rgb: 255, 173, 119;
  --st-accent-glow-rgb: 255, 156, 90;
  --st-white: rgba(239, 237, 236, .97);
  --st-muted: rgba(162, 157, 154, .95);
  --st-quiet: rgba(162, 157, 154, .85);
  --st-quiet-strong: rgba(239, 237, 236, .86);
  --st-hair: rgba(239, 237, 236, 0.128);
}
html #strata-root[data-skin="909"] > #strata-panel { filter: contrast(1.06) saturate(1.15); }
html #strata-root[data-skin="909"] #strata-panel {
  background: linear-gradient(180deg, #383b43 0%, #34373f 40%, #31343c 100%) !important;
  border-color: rgba(239, 237, 236, 0.16) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.032), inset 0 -1px 0 rgba(0,0,0,0.140), 0 28px 80px rgba(0,0,0,.55) !important;
}
html #strata-root[data-skin="909"] #strata-mini { background: linear-gradient(145deg, #3e4149, #2e3037) !important; }
html #strata-root[data-skin="909"] #strata-now, html #strata-root[data-skin="909"] #strata-utility-panel, html #strata-root[data-skin="909"] .strata-link-row, html #strata-root[data-skin="909"] #strata-track-analysis {
  background: rgba(44, 58, 85, 0.9) !important;
  border-color: rgba(162, 157, 154, 0.224) !important;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.122), inset 0 -1px 0 rgba(255,255,255,0.017) !important;
}
html #strata-root[data-skin="909"] #strata-controls button, html #strata-root[data-skin="909"] #strata-controls #strata-play {
  background: linear-gradient(180deg, #ebe9e8 0%, #e9e6e5 59%, #ccc9c9 100%) !important;
  color: #2a2c33 !important;
  border: 1px solid #1d1e23 !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.21), inset 0 -2px 0 rgba(0,0,0,0.17), 0 1.7px 0.7px rgba(0,0,0,.35) !important;
}
html #strata-root[data-skin="909"] .strata-switch { background: rgba(255,138,61, .14) !important; }
html #strata-root[data-skin="909"] #strata-header::after { background: linear-gradient(90deg, transparent 0%, #ff8a3d 0%, #ff8a3d 24.2%, transparent 24.2%, transparent 25.8%, #ff8a3d 25.8%, #ff8a3d 49.2%, transparent 49.2%, transparent 50.8%, #ff8a3d 50.8%, #ff8a3d 74.2%, transparent 74.2%, transparent 75.8%, #ff8a3d 75.8%, #ff8a3d 100%, transparent 100%) !important; }
html #strata-root[data-skin="909"] .strata-section-label, html #strata-root[data-skin="909"] .strata-analysis-title, html #strata-root[data-skin="909"] .strata-eyebrow, html #strata-root[data-skin="909"] .strata-radio-label { color: #ff8a3d !important; }
        
            /* 808 — "Night" look, chosen in the 808 skin lab (v8.6.3) */
html #strata-root[data-skin="808"] {
  --st-accent-rgb: 247, 197, 30;
  --st-accent-bright-rgb: 249, 214, 98;
  --st-accent-glow-rgb: 248, 206, 64;
  --st-white: rgba(236, 229, 208, .97);
  --st-muted: rgba(143, 135, 122, .95);
  --st-quiet: rgba(143, 135, 122, .85);
  --st-quiet-strong: rgba(236, 229, 208, .86);
  --st-hair: rgba(236, 229, 208, 0.116);
}
html #strata-root[data-skin="808"] > #strata-panel { filter: contrast(1.08) saturate(1.15); }
html #strata-root[data-skin="808"] #strata-panel {
  background: linear-gradient(180deg, #161514 0%, #0f0e0d 40%, #0e0d0c 100%) !important;
  border-color: rgba(236, 229, 208, 0.12) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.045), inset 0 -1px 0 rgba(0,0,0,0.200), 0 28px 80px rgba(0,0,0,.55) !important;
}
html #strata-root[data-skin="808"] #strata-mini { background: linear-gradient(145deg, #1b1a19, #0d0c0b) !important; }
html #strata-root[data-skin="808"] #strata-now, html #strata-root[data-skin="808"] #strata-utility-panel, html #strata-root[data-skin="808"] .strata-link-row, html #strata-root[data-skin="808"] #strata-track-analysis {
  background: rgba(25, 23, 21, 0.95) !important;
  border-color: rgba(143, 135, 122, 0.168) !important;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.175), inset 0 -1px 0 rgba(255,255,255,0.025) !important;
}
html #strata-root[data-skin="808"] .strata-switch { background: rgba(247, 197, 30, .14) !important; }

html #strata-root[data-skin="808"] #strata-controls button, html #strata-root[data-skin="808"] #strata-controls #strata-play { background: linear-gradient(180deg, #252525 0%, #1d1c1c 62.5%, #191818 100%) !important; border: 1px solid #070606 !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.18), 0 2px 1px rgba(0,0,0,.4) !important; }
html #strata-root[data-skin="808"] #strata-controls #strata-prev { color: #e5402f !important; }
html #strata-root[data-skin="808"] #strata-controls #strata-play { color: #f5821f !important; }
html #strata-root[data-skin="808"] #strata-controls #strata-next { color: #f7c51e !important; }
html #strata-root[data-skin="808"] #strata-header::after { background: linear-gradient(90deg, transparent 0%, #e5402f 0%, #e5402f 5.35%, transparent 5.35%, transparent 6.25%, #e5402f 6.25%, #e5402f 11.6%, transparent 11.6%, transparent 12.5%, #e5402f 12.5%, #e5402f 17.85%, transparent 17.85%, transparent 18.75%, #e5402f 18.75%, #e5402f 24.1%, transparent 24.1%, transparent 25%, #f5821f 25%, #f5821f 30.35%, transparent 30.35%, transparent 31.25%, #f5821f 31.25%, #f5821f 36.6%, transparent 36.6%, transparent 37.5%, #f5821f 37.5%, #f5821f 42.85%, transparent 42.85%, transparent 43.75%, #f5821f 43.75%, #f5821f 49.1%, transparent 49.1%, transparent 50%, #f7c51e 50%, #f7c51e 55.35%, transparent 55.35%, transparent 56.25%, #f7c51e 56.25%, #f7c51e 61.6%, transparent 61.6%, transparent 62.5%, #f7c51e 62.5%, #f7c51e 67.85%, transparent 67.85%, transparent 68.75%, #f7c51e 68.75%, #f7c51e 74.1%, transparent 74.1%, transparent 75%, #ece5d0 75%, #ece5d0 80.35%, transparent 80.35%, transparent 81.25%, #ece5d0 81.25%, #ece5d0 86.6%, transparent 86.6%, transparent 87.5%, #ece5d0 87.5%, #ece5d0 92.85%, transparent 92.85%, transparent 93.75%, #ece5d0 93.75%, #ece5d0 99.1%, transparent 99.1%) !important; }
html #strata-root[data-skin="808"] .strata-section-label, html #strata-root[data-skin="808"] .strata-analysis-title, html #strata-root[data-skin="808"] .strata-eyebrow, html #strata-root[data-skin="808"] .strata-radio-label { color: #f7c51e !important; background: #080707; padding: 2px 7px; border-radius: 2px; letter-spacing: .08em; box-shadow: inset 0 -1px 0 rgba(0,0,0,.35); display: inline-flex !important; align-items: center; gap: 7px; width: fit-content !important; max-width: max-content; justify-self: start; }
        `;

        document.documentElement
            .appendChild(
                style
            );

        document.body
            .appendChild(
                root
            );

        /*
            Restore the user's independent big-panel dimensions before
            any positioning code measures the panel.
        */

        applySavedPanelSize();

        updatePrismCycle();

        // ========================================================
        // EVENTS
        // ========================================================

        miniBrand.addEventListener(
            'click',

            event => {
                event.preventDefault();
                event.stopPropagation();

                if (
                    performance.now() <
                    suppressMiniClickUntil
                ) {
                    return;
                }

                setExpanded(
                    true
                );
            }
        );

        miniNext.addEventListener(
            'click',

            event => {
                event.preventDefault();
                event.stopPropagation();
                playNext();
            }
        );

        miniFavourite.addEventListener(
            'click',

            event => {
                event.preventDefault();
                event.stopPropagation();
                toggleFavourite();
            }
        );

        close.addEventListener(
            'click',

            event => {
                event.preventDefault();
                event.stopPropagation();
                setExpanded(
                    false
                );
            }
        );

        previous.addEventListener(
            'click',
            playPrevious
        );

        playPause.addEventListener(
            'click',
            togglePlayback
        );

        next.addEventListener(
            'click',
            playNext
        );

        favourite.addEventListener(
            'click',
            toggleFavourite
        );

        radio.addEventListener(
            'click',

            () => {
                radioEnabled =
                    !radioEnabled;

                GM_setValue(
                    RADIO_KEY,
                    radioEnabled
                );

                updateUI();
            }
        );

        visual.addEventListener(
            'click',

            () => {
                setVisualizerEnabled(
                    !visualizerEnabled
                );

                updateUI();

                setStatus(
                    visualizerEnabled
                        ? 'Visual engine on'
                        : 'Visual engine off'
                );
            }
        );

        linksToggle.addEventListener(
            'click',

            async () => {
                linksOpen =
                    !linksOpen;

                persistPanelSectionState();

                linksBody.classList.toggle(
                    'open',
                    linksOpen
                );

                linksChevron.textContent =
                    linksOpen
                        ? '⌃'
                        : '⌄';

                if (linksOpen) {
                    await scanCurrentLinks();
                }

                requestAnimationFrame(
                    applyPanelPosition
                );
            }
        );

        channelToggle.addEventListener(
            'click',

            () => {
                channelsOpen =
                    !channelsOpen;

                persistPanelSectionState();

                channelManager
                    .classList
                    .toggle(
                        'open',
                        channelsOpen
                    );

                channelChevron.textContent =
                    channelsOpen
                        ? '⌃'
                        : '⌄';

                requestAnimationFrame(
                    applyPanelPosition
                );
            }
        );

        utilityClose.addEventListener(
            'click',
            () => {
                setUtilityPanel(
                    utilityPanelOpen
                );
            }
        );

        libraryTab.addEventListener(
            'click',
            () =>
                setUtilityPanel(
                    'library'
                )
        );

        statsTab.addEventListener(
            'click',
            () =>
                setUtilityPanel(
                    'stats'
                )
        );

        settingsTab.addEventListener(
            'click',
            () =>
                setUtilityPanel(
                    'settings'
                )
        );

        aboutTab.addEventListener(
            'click',
            () =>
                setUtilityPanel(
                    'about'
                )
        );

        installMiniDragging(
            root,
            mini
        );

        installPanelDragging(
            root,
            panel,
            header
        );

        installPanelWheelIsolation(
            panel
        );

        installPanelResizing(
            root,
            panel,
            resizeGrip
        );

        /*
            Restore the exact internal panel state before restoring the
            expanded/collapsed player state.
        */

        restorePanelSectionState();
        applyPanelSectionStateToUI();

        renderChannelManager();

        updateNowPlaying();
        updatePlayPauseUI();
        updateUI();

        applyVisualizerVisibility();

        GM_setValue(
            VISUALIZER_ACTIVE_STYLES_KEY,
            visualizerActiveStyles
        );

        attachVisualizerAudio();

        startTrackAnalysis();

        if (visualizerEnabled) {
            startVisualizer();
        }

        /*
            Write the migrated/current layout as one authoritative snapshot.
        */

        persistPanelSectionState();

        /*
            Restore the saved open/collapsed state without changing it.
            This is the key to keeping the large player visible when
            YouTube loads the next STRATA track.
        */

        setExpanded(
            expanded,
            false
        );

        /*
            If Release Links was left open, keep the section open and
            populate it for the newly loaded video once YouTube has
            rendered its description.
        */

        if (expanded) {
            if (linksOpen) {
                setLinksMessage(
                    'Finding release links…'
                );
            }

            setTimeout(
                () => {
                    if (
                        expanded &&
                        lastLinkScanVideoId !==
                            currentVideoId()
                    ) {
                        scanCurrentLinks();
                    }
                },
                650
            );
        }
    }

    // ============================================================
    // LINKS UI
    // ============================================================

    function setLinksMessage(
        text
    ) {
        const body =
            document.getElementById(
                'strata-links-body'
            );

        if (!body) {
            return;
        }

        body.replaceChildren(
            el(
                'div',
                {
                    className:
                        'strata-links-message',

                    text
                }
            )
        );
    }

    function renderLinks() {
        const body =
            document.getElementById(
                'strata-links-body'
            );

        const count =
            document.getElementById(
                'strata-links-count'
            );

        if (
            !body ||
            !count
        ) {
            return;
        }

        count.textContent =
            currentLinks.length
                ? String(
                    currentLinks.length
                )
                : '';

        body.replaceChildren();

        if (
            !currentLinks.length
        ) {
            body.appendChild(
                el(
                    'div',
                    {
                        className:
                            'strata-links-message',

                        text:
                            'No release links found'
                    }
                )
            );

            return;
        }

        for (
            const link
            of currentLinks
        ) {
            const row =
                el(
                    'div',
                    {
                        className:
                            'strata-link-row'
                    }
                );

            const info =
                el(
                    'div',
                    {
                        className:
                            'strata-link-main'
                    }
                );

            info.append(
                el(
                    'div',
                    {
                        className:
                            'strata-link-service',

                        text:
                            link.service,

                        title:
                            link.url
                    }
                ),

                el(
                    'div',
                    {
                        className:
                            'strata-link-source',

                        text:
                            formatLinkDetail(
                                link
                            )
                    }
                )
            );

            const open =
                btn(
                    '',
                    '↗',
                    `Open ${link.service}`
                );

            open.className =
                'strata-link-open';

            open.addEventListener(
                'click',

                event => {
                    event.preventDefault();

                    event.stopPropagation();

                    window.open(
                        link.url,
                        '_blank',
                        'noopener,noreferrer'
                    );
                }
            );

            row.append(
                info,
                open
            );

            body.appendChild(
                row
            );
        }
    }

    function resetLinks() {
        currentLinks =
            [];

        resetReleaseMetadataSnapshot(
            currentVideoId()
        );

        lastLinkScanVideoId =
            null;

        /*
            Do NOT close the Release Links section here.

            Navigation used to reset linksOpen to false, which meant
            every STRATA-selected video collapsed the user's panel
            layout. Keep the user's chosen open/closed state and only
            refresh the contents for the new video.
        */

        const body =
            document.getElementById(
                'strata-links-body'
            );

        const chevron =
            document.getElementById(
                'strata-links-chevron'
            );

        if (body) {
            body.classList.toggle(
                'open',
                linksOpen
            );

            body.replaceChildren();

            if (linksOpen) {
                body.appendChild(
                    el(
                        'div',
                        {
                            className:
                                'strata-links-message',

                            text:
                                'Finding release links…'
                        }
                    )
                );
            }
        }

        if (chevron) {
            chevron.textContent =
                linksOpen
                    ? '⌃'
                    : '⌄';
        }

        const count =
            document.getElementById(
                'strata-links-count'
            );

        if (count) {
            count.textContent =
                '';
        }

        const releaseInfo =
            document.getElementById(
                'strata-release-info'
            );

        if (releaseInfo) {
            releaseInfo.classList.remove(
                'visible'
            );
            releaseInfo.replaceChildren();
        }
    }

    // ============================================================
    // CHANNEL MANAGER UI
    // ============================================================

    function renderChannelManager() {
        const list =
            document.getElementById(
                'strata-channel-list'
            );

        if (!list) {
            return;
        }

        list.replaceChildren();

        for (
            const channel
            of channelSettings
        ) {
            const row =
                el(
                    'div',
                    {
                        className:
                            'strata-channel-row'
                    }
                );

            const checkbox =
                document.createElement(
                    'input'
                );

            checkbox.type =
                'checkbox';

            checkbox.className =
                'strata-channel-checkbox';

            checkbox.checked =
                channel.enabled;

            const name =
                el(
                    'div',
                    {
                        className:
                            'strata-channel-name',

                        text:
                            channel.handle,

                        title:
                            channel.handle
                    }
                );

            const remove =
                btn(
                    '',
                    '×',
                    'Remove channel'
                );

            remove.className =
                'strata-channel-remove';

            if (
                channel.builtIn
            ) {
                remove.classList.add(
                    'hidden'
                );
            }

            checkbox.addEventListener(
                'change',

                () => {
                    setChannelEnabled(
                        channel.handle,
                        checkbox.checked
                    );
                }
            );

            remove.addEventListener(
                'click',

                event => {
                    event.preventDefault();

                    event.stopPropagation();

                    if (
                        !channel.builtIn
                    ) {
                        removeChannel(
                            channel.handle
                        );
                    }
                }
            );

            row.append(
                checkbox,
                name,
                remove
            );

            list.appendChild(
                row
            );
        }
    }

    // ============================================================
    // UI STATUS
    // ============================================================

    // ============================================================
    // NOTICES (v8.5.91)
    //
    // setStatus() only logs to the console. The few messages a user
    // genuinely needs to see (first library load, radio pausing itself)
    // go through this small self-dismissing pill instead.
    // ============================================================

    let strataNoticeTimer =
        0;

    /*
        v8.6.0: the welcome card and notices sit outside the player, so
        they take the ink palette directly (matching the store artwork).
    */
    function strataInfoPalette() {
        return {
            border: '1px solid rgba(255, 255, 255, .22)',
            background: 'rgba(12, 12, 12, .96)',
            color: 'rgba(240, 240, 240, .92)',
            title: 'rgb(250, 250, 250)',
            buttonBorder: '1px solid rgba(255, 255, 255, .45)',
            buttonBackground: 'rgba(255, 255, 255, .06)',
            shadow: '0 10px 30px rgba(0, 0, 0, .5)'
        };
    }

    function showStrataNotice(
        text,
        options =
            {}
    ) {
        setStatus(
            text
        );

        if (
            !document.body
        ) {
            return;
        }

        let notice =
            document.getElementById(
                'strata-notice'
            );

        if (!notice) {
            notice =
                document.createElement(
                    'div'
                );

            notice.id =
                'strata-notice';

            notice.setAttribute(
                'role',
                'status'
            );

            notice.setAttribute(
                'aria-live',
                'polite'
            );

            Object.assign(
                notice.style,
                {
                    position:
                        'fixed',
                    left:
                        '50%',
                    bottom:
                        '24px',
                    transform:
                        'translateX(-50%)',
                    zIndex:
                        '2147483646',
                    maxWidth:
                        'min(520px, calc(100vw - 32px))',
                    padding:
                        '10px 16px',
                    borderRadius:
                        '10px',
                    border:
                        strataInfoPalette().border,
                    background:
                        strataInfoPalette().background,
                    color:
                        strataInfoPalette().color,
                    font:
                        '600 12px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                    letterSpacing:
                        '.2px',
                    boxShadow:
                        '0 6px 24px rgba(0, 0, 0, .45)',
                    cursor:
                        'pointer',
                    transition:
                        'opacity .2s ease'
                }
            );

            notice.title =
                'Dismiss';

            notice.addEventListener(
                'click',
                () => {
                    notice.remove();
                }
            );

            document.body.appendChild(
                notice
            );
        }

        notice.textContent =
            text;

        notice.style.opacity =
            '1';

        {
            const palette =
                strataInfoPalette();

            notice.style.border = palette.border;
            notice.style.background = palette.background;
            notice.style.color = palette.color;
        }

        if (
            strataNoticeTimer
        ) {
            clearTimeout(
                strataNoticeTimer
            );

            strataNoticeTimer =
                0;
        }

        if (
            !options.sticky
        ) {
            strataNoticeTimer =
                setTimeout(
                    () => {
                        strataNoticeTimer =
                            0;

                        notice.remove();
                    },
                    options.durationMs ||
                        6000
                );
        }
    }

    function dismissStrataNotice() {
        document.getElementById(
            'strata-notice'
        )?.remove();
    }

    // ============================================================
    // NAVIGATION GOVERNOR (v8.5.91)
    //
    // Every STRATA page change goes through strataNavigate(). A log in
    // sessionStorage survives the per-track reloads, so automatic
    // behaviour is rate-limited across them:
    //   - automatic radio advances: at most 5 in 60 s. A run of tracks
    //     that end instantly (removed / blocked / zero-length videos)
    //     pauses the radio instead of rapid-firing YouTube page loads.
    //   - autoplay corrections: at most 3 per expected track in 60 s,
    //     then STRATA stops fighting the page.
    //   - any navigation within 800 ms of the previous one on the same
    //     page is dropped (double clicks / key repeat).
    // Manual Next / Previous / library clicks are never budget-limited.
    // ============================================================

    const STRATA_NAV_LOG_KEY =
        'strata_v8591_nav_log';

    const STRATA_NAV_WINDOW_MS =
        60 * 1000;

    const STRATA_AUTO_NAV_MAX =
        5;

    const STRATA_CORRECTION_MAX =
        3;

    const STRATA_NAV_MIN_GAP_MS =
        800;

    let strataNextNavigationKind =
        'user';

    let strataNavigationIssuedAt =
        0;

    function readStrataNavLog() {
        try {
            const parsed =
                JSON.parse(
                    sessionStorage.getItem(
                        STRATA_NAV_LOG_KEY
                    ) ||
                    '[]'
                );

            const now =
                Date.now();

            return Array.isArray(
                parsed
            )
                ? parsed.filter(
                    entry =>
                        entry &&
                        Number.isFinite(
                            entry.t
                        ) &&
                        now -
                            entry.t <
                            STRATA_NAV_WINDOW_MS
                )
                : [];

        } catch {
            return [];
        }
    }

    function writeStrataNavLog(
        log
    ) {
        try {
            sessionStorage.setItem(
                STRATA_NAV_LOG_KEY,
                JSON.stringify(
                    log.slice(
                        -40
                    )
                )
            );
        } catch {}
    }

    function strataAutoNavigationAllowed() {
        return (
            readStrataNavLog().filter(
                entry =>
                    entry.k ===
                    'auto'
            ).length <
            STRATA_AUTO_NAV_MAX
        );
    }

    function strataCorrectionAllowed(
        videoId
    ) {
        return (
            readStrataNavLog().filter(
                entry =>
                    entry.k ===
                        'correction' &&
                    entry.v ===
                        videoId
            ).length <
            STRATA_CORRECTION_MAX
        );
    }

    function strataNavigate(
        videoId,
        replace =
            false
    ) {
        const kind =
            strataNextNavigationKind;

        strataNextNavigationKind =
            'user';

        if (
            !videoId
        ) {
            return false;
        }

        const now =
            Date.now();

        if (
            strataNavigationIssuedAt &&
            now -
                strataNavigationIssuedAt <
                STRATA_NAV_MIN_GAP_MS
        ) {
            console.debug(
                '[STRATA] navigation dropped (already leaving this page)',
                videoId
            );

            return false;
        }

        strataNavigationIssuedAt =
            now;

        const log =
            readStrataNavLog();

        log.push({
            t:
                now,
            k:
                kind,
            v:
                String(
                    videoId
                )
        });

        writeStrataNavLog(
            log
        );

        if (
            kind ===
                'user'
        ) {
            dismissStrataNotice();
        }

        const url =
            `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

        if (
            replace
        ) {
            location.replace(
                url
            );
        } else {
            location.assign(
                url
            );
        }

        return true;
    }

    function setStatus(
        text
    ) {
        console.log(
            '[STRATA]',
            text
        );
    }

    function updateUI() {
        const channels =
            getEnabledChannels()
                .length;

        const active =
            activeRequests >
                0 ||
            initialSweepRunning;

        const channelCount =
            document.getElementById(
                'strata-channel-count'
            );

        if (channelCount) {
            channelCount.textContent =
                String(
                    channels
                );
        }

        const activity =
            document.getElementById(
                'strata-activity'
            );

        if (activity) {
            activity.classList.toggle(
                'active',
                active
            );
        }

        const mini =
            document.getElementById(
                'strata-mini'
            );

        if (mini) {
            mini.classList.toggle(
                'active',
                active
            );
        }

        const radio =
            document.getElementById(
                'strata-radio'
            );

        if (radio) {
            radio.classList.toggle(
                'on',
                radioEnabled
            );

            radio.setAttribute(
                'aria-pressed',
                radioEnabled
                    ? 'true'
                    : 'false'
            );
        }

        const visualFrontToggle =
            document.getElementById(
                'strata-visual-fronttoggle'
            );

        if (visualFrontToggle) {
            visualFrontToggle.classList.toggle(
                'on',
                visualizerEnabled
            );

            visualFrontToggle.setAttribute(
                'aria-pressed',
                visualizerEnabled
                    ? 'true'
                    : 'false'
            );
        }

        updatePlayPauseUI();

        renderFocusBar();

        if (
            utilityPanelOpen
        ) {
            renderUtilityPanel();
        }
    }

    // ============================================================
    // PLAYER
    // ============================================================

    function scheduleAutoStart(
        delay = 250
    ) {
        if (
            !radioEnabled ||
            !isCurrentVideoStrataOwned()
        ) {
            return;
        }

        const id =
            currentVideoId();

        if (
            !id ||
            autoStartVideoId ===
                id
        ) {
            return;
        }

        autoStartVideoId =
            id;

        if (autoStartTimer) {
            clearTimeout(
                autoStartTimer
            );
        }

        autoStartTimer =
            setTimeout(
                () => {
                    autoStartTimer =
                        null;

                    attemptAutoStart(
                        id,
                        0
                    );
                },
                delay
            );
    }

    // ============================================================
    // AUTOPLAY BLOCKED (v8.5.99)
    // A browser autoplay policy (Firefox's default "Block Audio") can
    // refuse play() on the freshly loaded track page. Wait a moment in
    // case YouTube's own fallback succeeds, then explain, resume on the
    // next click or key press anywhere, and say how to allow it for good.
    // ============================================================

    let strataAutoplayBlockedCount =
        0;

    let strataAutoplayResumeArmed =
        false;

    function strataIsFirefox() {
        return /firefox\//i.test(
            navigator.userAgent ||
            ''
        );
    }

    function strataAutoplayPolicy() {
        try {
            if (
                typeof navigator.getAutoplayPolicy ===
                    'function'
            ) {
                return navigator.getAutoplayPolicy(
                    'mediaelement'
                );
            }
        } catch {}

        return 'n/a';
    }

    function handleAutoplayRefusal( id, error ) {
        if (
            !error ||
            error.name !==
                'NotAllowedError'
        ) {
            return;
        }

        setTimeout(
            () => {
                const video =
                    currentMainVideo();

                if (
                    !video ||
                    !video.paused ||
                    currentVideoId() !==
                        id ||
                    !radioEnabled
                ) {
                    return;
                }

                strataAutoplayBlockedCount++;

                console.log(
                    '[STRATA] autoplay blocked by the browser — waiting for a click'
                );

                const fix =
                    strataIsFirefox()
                        ? 'To fix it for good: click the icon at the left of the address bar → Autoplay → Allow Audio and Video.'
                        : 'To fix it for good: allow sound / autoplay for youtube.com in your browser\'s site settings.';

                showStrataNotice(
                    `Your browser blocked autoplay, so the radio can't start the next track by itself. Click anywhere to play. ${fix}`,
                    {
                        sticky: true
                    }
                );

                armAutoplayResume( id );
            },
            900
        );
    }

    function armAutoplayResume( id ) {
        if ( strataAutoplayResumeArmed ) {
            return;
        }

        strataAutoplayResumeArmed =
            true;

        const resume =
            ( event ) => {
                // A click on the player itself, or Space / K, already
                // makes YouTube toggle playback: starting it here too
                // would have that same click pause it again.
                const youtubeHandlesIt =
                    (
                        event?.type ===
                            'pointerdown' &&
                        event.target?.closest?.(
                            '#movie_player'
                        )
                    ) ||
                    (
                        event?.type ===
                            'keydown' &&
                        (
                            event.key ===
                                ' ' ||
                            event.key?.toLowerCase?.() ===
                                'k'
                        )
                    );

                document.removeEventListener(
                    'pointerdown',
                    resume,
                    true
                );

                document.removeEventListener(
                    'keydown',
                    resume,
                    true
                );

                strataAutoplayResumeArmed =
                    false;

                dismissStrataNotice();

                const video =
                    currentMainVideo();

                if (
                    !youtubeHandlesIt &&
                    video &&
                    video.paused &&
                    currentVideoId() ===
                        id
                ) {
                    try {
                        const result =
                            video.play();

                        result?.catch?.(
                            () => {}
                        );
                    } catch {}

                    setTimeout(
                        updatePlayPauseUI,
                        200
                    );
                }
            };

        document.addEventListener(
            'pointerdown',
            resume,
            true
        );

        document.addEventListener(
            'keydown',
            resume,
            true
        );
    }

    function attemptAutoStart(
        id,
        attempt
    ) {
        if (
            !radioEnabled ||
            currentVideoId() !==
                id ||
            getOwnedVideoId() !==
                id ||
            document.hidden
        ) {
            return;
        }

        const video =
            currentMainVideo();

        if (!video) {
            if (attempt < 8) {
                setTimeout(
                    () =>
                        attemptAutoStart(
                            id,
                            attempt + 1
                        ),
                    300
                );
            }

            return;
        }

        if (!video.paused) {
            updatePlayPauseUI();
            return;
        }

        /*
            Wait briefly for YouTube to attach media before asking it to
            play. This makes refreshes much more reliable without creating
            any repeating autoplay loop.
        */

        if (
            video.readyState < 2 &&
            attempt < 8
        ) {
            setTimeout(
                () =>
                    attemptAutoStart(
                        id,
                        attempt + 1
                    ),
                300
            );

            return;
        }

        try {
            const result =
                video.play();

            if (
                result &&
                typeof result.catch ===
                    'function'
            ) {
                result.catch(
                    ( error ) => {
                        handleAutoplayRefusal(
                            id,
                            error
                        );

                        /*
                            YouTube's own player API is a useful fallback
                            if the HTMLMediaElement call is rejected while
                            the player is still completing setup.
                        */

                        const player =
                            document.querySelector(
                                '#movie_player'
                            );

                        try {
                            if (
                                player &&
                                typeof player.playVideo ===
                                    'function'
                            ) {
                                player.playVideo();
                            }
                        } catch {}
                    }
                );
            }

        } catch {}

        setTimeout(
            updatePlayPauseUI,
            200
        );
    }

    function requestRadioAdvanceFromEnded() {
        if (
            !radioEnabled ||
            !isCurrentVideoStrataOwned()
        ) {
            return;
        }

        if (
            adRecentlyActive()
        ) {
            console.log(
                '[STRATA] ended signal came from an ad — staying on this track'
            );

            return;
        }

        const now =
            Date.now();

        /*
            YouTube's SPA player can very rarely deliver a late or duplicate
            ended signal while the next video is already taking over the same
            media element. Without a lock, that second signal can be mistaken
            for the new track ending and consume another prefetched track.

            Only automatic end-of-track advances are locked. Manual Next
            remains immediate.
        */

        if (
            now <
            radioEndHandoffLockedUntil
        ) {
            return;
        }

        radioEndHandoffLockedUntil =
            now +
            RADIO_END_HANDOFF_LOCK_MS;

        if (
            !strataAutoNavigationAllowed()
        ) {
            showStrataNotice(
                'Radio paused — several tracks ended back-to-back. Press Next to carry on.',
                {
                    sticky:
                        true
                }
            );

            return;
        }

        strataNextNavigationKind =
            'auto';

        try {
            playNext();
        } finally {
            // If playNext() returned without navigating (empty queue,
            // no channels), do not let 'auto' leak into a manual click.
            strataNextNavigationKind =
                'user';
        }
    }

    // ============================================================
    // AD AWARENESS (v8.5.94)
    //
    // YouTube plays ads in the same <video> element and marks the player
    // with "ad-showing" / "ad-interrupting" while one runs. An ad ending
    // fires the same "ended" event as a track ending, so without this an
    // ad could make the radio skip the track it was in front of, and the
    // BPM/key analysis would analyse the ad. Both now ignore ads, plus a
    // short grace period after one finishes.
    // ============================================================

    const AD_GRACE_MS =
        2500;

    let adWatchedPlayer =
        null;

    let adObserver =
        null;

    let adWasShowing =
        false;

    let adEndedAt =
        0;

    function isAdPlaying() {
        const player =
            document.getElementById(
                'movie_player'
            );

        return Boolean(
            player &&
            (
                player.classList.contains(
                    'ad-showing'
                ) ||
                player.classList.contains(
                    'ad-interrupting'
                )
            )
        );
    }

    function noteAdState() {
        const showing =
            isAdPlaying();

        if (
            adWasShowing &&
            !showing
        ) {
            adEndedAt =
                Date.now();

            console.log(
                '[STRATA] ad finished'
            );
        }

        if (
            showing &&
            !adWasShowing
        ) {
            console.log(
                '[STRATA] ad playing — radio and analysis on hold'
            );
        }

        adWasShowing =
            showing;
    }

    function adRecentlyActive() {
        noteAdState();

        return (
            isAdPlaying() ||
            Date.now() -
                adEndedAt <
                AD_GRACE_MS
        );
    }

    function watchAdState() {
        const player =
            document.getElementById(
                'movie_player'
            );

        if (
            !player ||
            player ===
                adWatchedPlayer ||
            typeof MutationObserver !==
                'function'
        ) {
            return;
        }

        adObserver
            ?.disconnect();

        adObserver =
            new MutationObserver(
                noteAdState
            );

        adObserver.observe(
            player,
            {
                attributes:
                    true,
                attributeFilter:
                    [
                        'class'
                    ]
            }
        );

        adWatchedPlayer =
            player;

        noteAdState();
    }

    function attachPlayer() {
        watchAdState();

        /*
            v8.5.96: STRATA loads a fresh page per track, and YouTube can
            build its player after STRATA first positions the panel. If the
            player wasn't there yet the docked panel fell back to its short
            default size and stayed that way. Re-check here (every 1.5 s)
            and re-dock as soon as the player exists.
        */

        if (
            expanded &&
            isPanelDocked()
        ) {
            const before =
                panelDockObservedNode;

            watchPlayerForDocking();

            if (
                panelDockObservedNode !==
                    before ||
                !panelDockLastApplied
            ) {
                applyPanelPosition();
            }
        }

        applyMediaSessionHandlers();

        const video =
            currentMainVideo();

        if (!video) {
            updatePlayPauseUI();
            return;
        }

        if (
            video.dataset
                .strataV853Bound
        ) {
            updatePlayPauseUI();
            return;
        }

        video.dataset
            .strataV853Bound =
            '1';

        video.addEventListener(
            'play',
            () => {
                updatePlayPauseUI();

                // YouTube re-registers its own media handlers on playback.
                setTimeout(
                    applyMediaSessionHandlers,
                    300
                );

                attachVisualizerAudio();

                if (visualizerEnabled) {
                    startVisualizer();
                }

                updateTrackAnalysisUI();
            }
        );

        video.addEventListener(
            'pause',
            () => {
                updatePlayPauseUI();

                updateVisualizerHud();

                updateTrackAnalysisUI();
            }
        );

        video.addEventListener(
            'ended',

            () => {
                updatePlayPauseUI();

                requestRadioAdvanceFromEnded();
            }
        );

        updatePlayPauseUI();
    }

    // ============================================================
    // YOUTUBE NAVIGATION
    // ============================================================

    function enforceExpectedNavigationNow() {
        if (
            !radioEnabled
        ) {
            return false;
        }

        const expected =
            getExpectedVideoId();

        const current =
            currentVideoId();

        if (
            !expected ||
            !current ||
            current ===
                expected
        ) {
            if (
                current &&
                current ===
                    expected
            ) {
                expectedCorrectionTarget =
                    null;

                expectedCorrectionAt =
                    0;
            }

            return false;
        }

        const now =
            Date.now();

        /*
            The old recovery path waited for YouTube's watch-page DOM to settle.
            That 450 ms delay was enough for a native autoplay recommendation
            to become audible. Ownership correction now happens immediately;
            the slower UI restoration still happens later.
        */

        const video =
            currentMainVideo();

        try {
            video?.pause();
        } catch {}

        if (
            expectedCorrectionTarget !==
                expected ||
            now -
                expectedCorrectionAt >
                750
        ) {
            expectedCorrectionTarget =
                expected;

            expectedCorrectionAt =
                now;

            if (
                !strataCorrectionAllowed(
                    expected
                )
            ) {
                /*
                    The page keeps landing somewhere else. Stop correcting
                    rather than reloading YouTube in a loop; release
                    ownership so the user's page is left alone.
                */

                console.warn(
                    '[STRATA] autoplay correction limit reached — leaving this page alone',
                    expected
                );

                clearExpectedVideo();

                return false;
            }

            strataNextNavigationKind =
                'correction';

            strataNavigate(
                expected,
                true
            );
        }

        return true;
    }

    function handleNavigation() {
        if (
            enforceExpectedNavigationNow()
        ) {
            return;
        }

        setTimeout(
            () => {
                const current =
                    currentVideoId();

                const expected =
                    getExpectedVideoId();

                /*
                    Second ownership check after YouTube's DOM settles. The
                    fast path above normally catches a stray autoplay before
                    it becomes audible; this remains as a safety net.
                */

                if (
                    enforceExpectedNavigationNow()
                ) {
                    return;
                }

                if (
                    expected &&
                    current === expected
                ) {
                    writeSessionValue(
                        SESSION_OWNED_VIDEO_KEY,
                        current
                    );

                    clearExpectedVideo();

                    expectedCorrectionTarget =
                        null;

                    expectedCorrectionAt =
                        0;
                }

                syncFavouritesPlaylistToCurrent();

                attachPlayer();

                /*
                    YouTube can rebuild parts of the watch page between
                    videos. Re-read the user's saved STRATA layout and
                    immediately re-apply it before refreshing track data.
                */

                restorePanelSectionState();
                applyPanelSectionStateToUI();

                /*
                    Only a STRATA-owned navigation may be auto-started.
                    Ordinary YouTube browsing is left completely alone.
                */

                scheduleAutoStart(
                    300
                );

                updateNowPlaying();

                updatePlayPauseUI();

                resetTrackAnalysis(
                    currentVideoId()
                );

                attachVisualizerAudio();

                resetLinks();

                if (
                    linksOpen ||
                    expanded
                ) {
                    scanCurrentLinks();
                }

                fillPrefetchQueue();

                /*
                    If the mini player has never been manually placed,
                    recalculate its natural default against the newly
                    rendered YouTube metadata row.
                */

                if (
                    !getSavedAnchor() &&
                    !expanded
                ) {
                    saveAnchor(
                        findDefaultAnchor()
                    );
                }

                if (expanded) {
                    applyPanelPosition();

                } else {
                    applyMiniPosition();
                }
            },
            450
        );
    }

    // ============================================================
    // INIT
    // ============================================================

    // ============================================================
    // HOSTED SEED AUTO-UPDATE
    // ============================================================

    /*
        Fetches the hosted master seed from GitHub raw, and if it is newer
        than the last one we merged, silently merges the new tracks into the
        local cache via the existing seed-ingest path. Fails soft: any
        network, parse, or format problem is caught and logged, and STRATA
        continues normally on its existing cache.
    */

    /*
        v8.5.91: the hourly check used to download the whole catalogue
        (~10 MB) just to read its createdAt. It now sends the ETag from the
        last good download; GitHub answers 304 Not Modified with no body
        when nothing changed. First installs never send an ETag, so they
        always receive the full file.
    */

    const HOSTED_SEED_ETAG_KEY =
        'strata_v8591_hosted_seed_etag';

    function headerValue(
        rawHeaders,
        name
    ) {
        const wanted =
            name.toLowerCase();

        for (
            const line
            of String(
                rawHeaders ||
                ''
            ).split(
                /\r?\n/
            )
        ) {
            const index =
                line.indexOf(
                    ':'
                );

            if (
                index >
                    0 &&
                line
                    .slice(
                        0,
                        index
                    )
                    .trim()
                    .toLowerCase() ===
                    wanted
            ) {
                return line
                    .slice(
                        index + 1
                    )
                    .trim();
            }
        }

        return '';
    }

    function fetchHostedSeedText(
        url,
        etag =
            ''
    ) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                const headers =
                    {};

                if (
                    etag
                ) {
                    headers['If-None-Match'] =
                        etag;
                }

                GM_xmlhttpRequest({
                    method:
                        'GET',

                    url:
                        url,

                    headers,

                    responseType:
                        'text',

                    timeout:
                        20000,

                    onload:
                        response => {
                            if (
                                response.status ===
                                    304
                            ) {
                                resolve({
                                    notModified:
                                        true,

                                    text:
                                        '',

                                    etag
                                });

                            } else if (
                                response.status >=
                                    200 &&
                                response.status <
                                    300
                            ) {
                                resolve({
                                    notModified:
                                        false,

                                    text:
                                        response.responseText,

                                    etag:
                                        headerValue(
                                            response.responseHeaders,
                                            'etag'
                                        )
                                });

                            } else {
                                reject(
                                    new Error(
                                        `HTTP ${response.status}`
                                    )
                                );
                            }
                        },

                    onerror:
                        () =>
                            reject(
                                new Error(
                                    'Hosted seed request failed'
                                )
                            ),

                    ontimeout:
                        () =>
                            reject(
                                new Error(
                                    'Hosted seed request timed out'
                                )
                            )
                });
            }
        );
    }

    async function checkHostedSeedForUpdates(
        force =
            false
    ) {
        if (
            !HOSTED_SEED_URL
        ) {
            return;
        }

        const now =
            Date.now();

        const lastSuccess =
            Number(
                GM_getValue(
                    HOSTED_SEED_LAST_CHECK_KEY,
                    0
                )
            ) ||
            0;

        const lastFailure =
            Number(
                GM_getValue(
                    HOSTED_SEED_LAST_FAILURE_KEY,
                    0
                )
            ) ||
            0;

        if (
            !force
        ) {
            if (
                now -
                    lastSuccess <
                    HOSTED_SEED_CHECK_INTERVAL_MS
            ) {
                return;
            }

            if (
                lastFailure &&
                now -
                    lastFailure <
                    HOSTED_SEED_FAILURE_BACKOFF_MS
            ) {
                return;
            }
        }

        /*
            First full load: nothing has ever been merged from GitHub, so
            the user is on the 150-track starter set. Tell them what is
            happening, and tell them plainly if it fails.
        */

        const firstFullLoad =
            !lastSuccess &&
            !String(
                GM_getValue(
                    HOSTED_SEED_LAST_VERSION_KEY,
                    ''
                )
            );

        if (
            firstFullLoad
        ) {
            showStrataNotice(
                'Loading the full STRATA library…',
                {
                    durationMs:
                        20000
                }
            );
        }

        const storedEtag =
            firstFullLoad ||
            force
                ? ''
                : String(
                    GM_getValue(
                        HOSTED_SEED_ETAG_KEY,
                        ''
                    )
                );

        let parsed;

        let responseEtag =
            '';

        try {
            const result =
                await fetchHostedSeedText(
                    HOSTED_SEED_URL,
                    storedEtag
                );

            if (
                result.notModified
            ) {
                GM_setValue(
                    HOSTED_SEED_LAST_CHECK_KEY,
                    now
                );

                console.log(
                    '[STRATA] Hosted seed unchanged (304)'
                );

                return;
            }

            responseEtag =
                result.etag ||
                '';

            parsed =
                JSON.parse(
                    result.text
                );

        } catch (error) {
            GM_setValue(
                HOSTED_SEED_LAST_FAILURE_KEY,
                now
            );

            console.warn(
                '[STRATA] Hosted seed fetch failed:',
                error?.message ||
                    error
            );

            if (
                firstFullLoad
            ) {
                showStrataNotice(
                    'Full library unavailable right now — playing the starter set. STRATA will retry in a few minutes.',
                    {
                        durationMs:
                            12000
                    }
                );
            }

            return;
        }

        /*
            Version gate. The seed files carry a createdAt timestamp; if the
            hosted file is not newer than the last one we merged, skip the
            merge entirely so we do not reprocess the same catalogue.
        */

        const hostedVersion =
            String(
                parsed?.createdAt ||
                ''
            );

        const lastVersion =
            String(
                GM_getValue(
                    HOSTED_SEED_LAST_VERSION_KEY,
                    ''
                )
            );

        if (
            hostedVersion &&
            hostedVersion ===
                lastVersion
        ) {
            GM_setValue(
                HOSTED_SEED_LAST_CHECK_KEY,
                now
            );

            if (
                responseEtag
            ) {
                GM_setValue(
                    HOSTED_SEED_ETAG_KEY,
                    responseEtag
                );
            }

            return;
        }

        let tracks;

        try {
            tracks =
                normalizeImportedSeed(
                    parsed
                );

        } catch (error) {
            GM_setValue(
                HOSTED_SEED_LAST_FAILURE_KEY,
                now
            );

            console.warn(
                '[STRATA] Hosted seed not a recognised library:',
                error?.message ||
                    error
            );

            if (
                firstFullLoad
            ) {
                showStrataNotice(
                    'Full library unavailable right now — playing the starter set. STRATA will retry in a few minutes.',
                    {
                        durationMs:
                            12000
                    }
                );
            }

            return;
        }

        let added =
            0;

        try {
            added =
                mergeSeedTracks(
                    tracks
                );

        } catch (error) {
            GM_setValue(
                HOSTED_SEED_LAST_FAILURE_KEY,
                now
            );

            console.warn(
                '[STRATA] Hosted seed merge failed:',
                error?.message ||
                    error
            );

            if (
                firstFullLoad
            ) {
                showStrataNotice(
                    'Full library unavailable right now — playing the starter set. STRATA will retry in a few minutes.',
                    {
                        durationMs:
                            12000
                    }
                );
            }

            return;
        }

        GM_setValue(
            HOSTED_SEED_LAST_CHECK_KEY,
            now
        );

        if (
            hostedVersion
        ) {
            GM_setValue(
                HOSTED_SEED_LAST_VERSION_KEY,
                hostedVersion
            );
        }

        if (
            responseEtag
        ) {
            GM_setValue(
                HOSTED_SEED_ETAG_KEY,
                responseEtag
            );
        }

        if (
            firstFullLoad
        ) {
            showStrataNotice(
                `Full library ready · ${getUniqueTotal().toLocaleString()} tracks`,
                {
                    durationMs:
                        6000
                }
            );
        }

        if (
            added >
                0
        ) {
            setStatus(
                `Library updated · ${added.toLocaleString()} new tracks`
            );

            console.log(
                `[STRATA] Hosted seed merged ${added} new track(s).`
            );
        }
    }

    function init() {
        migrateMiniForIntegratedFavourite();

        migratePanelPlacementIfNeeded();

        createUI();

        const bundledSeedResult =
            installBundledSeedIfNeeded();

        if (
            bundledSeedResult.added >
                0
        ) {
            setStatus(
                `Starter library ready · ${bundledSeedResult.added.toLocaleString()} tracks added`
            );
        }

        updateNowPlaying();

        updateUI();

        /*
            Silent hosted-seed check. Runs at most once per interval, fails
            soft, and merges any new tracks into the local cache. Fire and
            forget: we do not await it, so it never delays STRATA startup.
        */

        checkHostedSeedForUpdates();

        installKeyboardShortcuts();

        setTimeout(
            showFirstRunTipsIfNeeded,
            2500
        );

        /*
            v8.5.87: the visual loop stops itself while the tab is hidden.
            If that happened on the exact frame the tab was hidden, nothing
            ever restarted it, so the visuals stayed frozen after switching
            back. Resume the audio tap and restart the loop on return.
        */

        const resumeVisualEngine =
            () => {
                if (
                    document.hidden
                ) {
                    return;
                }

                visualizerLastFrameTime =
                    0;

                visualizerLastRenderTime =
                    0;

                if (
                    visualizerContext
                        ?.state ===
                    'suspended'
                ) {
                    visualizerContext
                        .resume()
                        .catch(
                            () => {}
                        );
                }

                attachVisualizerAudio();

                if (
                    visualizerEnabled &&
                    expanded &&
                    !utilityPanelOpen
                ) {
                    if (
                        visualizerRaf
                    ) {
                        cancelAnimationFrame(
                            visualizerRaf
                        );

                        visualizerRaf =
                            0;
                    }

                    startVisualizer();
                }

                updateTrackAnalysisUI();
            };

        document.addEventListener(
            'visibilitychange',
            resumeVisualEngine
        );

        window.addEventListener(
            'focus',
            resumeVisualEngine
        );

        attachPlayer();

        adoptInitialStrataVideo();

        syncFavouritesPlaylistToCurrent();

        scheduleAutoStart(
            450
        );

        fillPrefetchQueue();

        document.addEventListener(
            'yt-navigate-start',
            () => {
                persistPanelSectionState();
                persistPanelPosition();

                enforceExpectedNavigationNow();
            }
        );

        document.addEventListener(
            'yt-navigate-finish',
            handleNavigation
        );

        window.addEventListener(
            'pagehide',
            () => {
                persistPanelSectionState();
                persistPanelPosition();

                flushPendingCacheWrite();

                try {
                    v2FlushOnLeave();
                } catch {}

                flushTrackAnalysisMemory();

                visualizerCanvasResizeObserver
                    ?.disconnect?.();

                if (trackAnalysisTimer) {
                    clearInterval(
                        trackAnalysisTimer
                    );

                    trackAnalysisTimer =
                        0;
                }

                releaseVisualizerAudio();
            }
        );

        window.addEventListener(
            'beforeunload',
            persistPanelPosition
        );

        setInterval(
            attachPlayer,
            1500
        );

        /*
            v8.5.6 placement-only migration.

            Existing users are moved to the new lower-right player
            position once. First-time users get the same default.
            Manual dragging remains persistent after that.
        */

        setTimeout(
            () =>
                migrateMiniPlacementIfNeeded(),
            900
        );

        window.addEventListener(
            'resize',
            () => {
                if (expanded) {
                    applySavedPanelSize();
                    applyPanelPosition();
                } else {
                    applyMiniPosition();
                }
            }
        );


    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once:
                    true
            }
        );

    } else {
        init();
    }

})();