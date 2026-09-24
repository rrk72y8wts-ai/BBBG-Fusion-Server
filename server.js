//
// BBBG Fusion Server
// For BBBG watchOS app ONLY
//

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ============================================================
// SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

const WATCH_TIMEOUT_MS = 5 * 60 * 1000;
const ROOM_TIMEOUT_MS = 60 * 60 * 1000;

const SOUND_START_DELAY_MS = 1500;

const MAX_WATCHES = 2;

// ============================================================
// SERVER IDENTITY
// ============================================================

const SERVER_NAME = "BBBG Fusion Server";
const APP_ID = "BBBG";

// ============================================================
// ROOMS
// ============================================================

const rooms = new Map();

// ============================================================
// TIME
// ============================================================

function serverNow() {
    return Date.now();
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {
    res.json({
        ok: true,
        service: SERVER_NAME,
        app: APP_ID,
        serverNow: serverNow()
    });
});

// ============================================================
// ROOM HELPERS
// ============================================================

function getOrCreateRoom(roomCode) {

    let room = rooms.get(roomCode);

    if (!room) {

        room = {
            watches: new Map(),

            pendingBump: null,

            activeEvent: null,

            createdAt: serverNow(),

            updatedAt: serverNow()
        };

        rooms.set(roomCode, room);
    }

    return room;
}

// ============================================================
// CLEANUP
// ============================================================

function cleanupRoom(room) {

    const now = serverNow();

    for (const [watchID, watch] of room.watches.entries()) {

        if (
            now - watch.lastSeen >
            WATCH_TIMEOUT_MS
        ) {

            room.watches.delete(watchID);

            if (
                room.pendingBump &&
                room.pendingBump.watchID === watchID
            ) {

                room.pendingBump = null;
            }
        }
    }
}

// ============================================================
// VALID FUSION PAIRS
// ============================================================

const validFusionPairs = new Set([

    "blaze|ice",

    "ice|quake",

    "quake|thunder",

    "solar|thunder",

    "solar|thorn",

    "cyclone|solar"
]);

function normalizePair(first, second) {

    return `${first}|${second}`;
}

function isValidFusionPair(first, second) {

    return validFusionPairs.has(
        normalizePair(first, second)
    );
}

// ============================================================
// REGISTER WATCH
// ============================================================

app.post("/room/register", (req, res) => {

    const {
        room,
        watchID
    } = req.body;

    if (!room || !watchID) {

        return res.status(400).json({

            ok: false,

            error:
                "room and watchID are required",

            serverNow:
                serverNow()
        });
    }

    const roomData =
        getOrCreateRoom(room);

    cleanupRoom(roomData);

    // --------------------------------------------------------
    // Existing watch
    // --------------------------------------------------------

    if (
        roomData.watches.has(watchID)
    ) {

        const existing =
            roomData.watches.get(watchID);

        existing.lastSeen =
            serverNow();

        roomData.updatedAt =
            serverNow();

        return res.json({

            ok: true,

            registered: true,

            room,

            watchID,

            watchCount:
                roomData.watches.size,

            serverNow:
                serverNow()
        });
    }

    // --------------------------------------------------------
    // Maximum two watches
    // --------------------------------------------------------

    if (
        roomData.watches.size >=
        MAX_WATCHES
    ) {

        return res.status(409).json({

            ok: false,

            error:
                "Room already has two watches",

            serverNow:
                serverNow()
        });
    }

    // --------------------------------------------------------
    // Register
    // --------------------------------------------------------

    roomData.watches.set(
        watchID,
        {
            watchID,

            element: null,

            tier: null,

            lastSeen:
                serverNow()
        }
    );

    roomData.updatedAt =
        serverNow();

    console.log(
        `📱 [BBBG] Watch registered: ${watchID} in room ${room}`
    );

    res.json({

        ok: true,

        registered: true,

        room,

        watchID,

        watchCount:
            roomData.watches.size,

        serverNow:
            serverNow()
    });
});

// ============================================================
// UPDATE WATCH STATE
// ============================================================

app.post("/room/state", (req, res) => {

    const {
        room,
        watchID,
        element,
        tier
    } = req.body;

    if (!room || !watchID) {

        return res.status(400).json({

            ok: false,

            error:
                "room and watchID are required",

            serverNow:
                serverNow()
        });
    }

    const roomData =
        rooms.get(room);

    if (!roomData) {

        return res.status(404).json({

            ok: false,

            error:
                "Room not found",

            serverNow:
                serverNow()
        });
    }

    const watch =
        roomData.watches.get(watchID);

    if (!watch) {

        return res.status(404).json({

            ok: false,

            error:
                "Watch not registered",

            serverNow:
                serverNow()
        });
    }

    watch.lastSeen =
        serverNow();

    if (
        typeof element === "string" &&
        element.length > 0
    ) {

        watch.element =
            element;
    }

    if (
        typeof tier === "number" &&
        Number.isFinite(tier)
    ) {

        watch.tier =
            tier;
    }

    roomData.updatedAt =
        serverNow();

    res.json({

        ok: true,

        serverNow:
            serverNow()
    });
});

// ============================================================
// FIST BUMP
// ============================================================

app.post("/room/bump", (req, res) => {

    const {
        room,
        watchID,
        element,
        tier,
        bumpID
    } = req.body;

    if (!room || !watchID) {

        return res.status(400).json({

            ok: false,

            error:
                "room and watchID are required",

            serverNow:
                serverNow()
        });
    }

    const roomData =
        rooms.get(room);

    if (!roomData) {

        return res.status(404).json({

            ok: false,

            error:
                "Room not found",

            serverNow:
                serverNow()
        });
    }

    const watch =
        roomData.watches.get(watchID);

    if (!watch) {

        return res.status(404).json({

            ok: false,

            error:
                "Watch not registered",

            serverNow:
                serverNow()
        });
    }

    watch.lastSeen =
        serverNow();

    // --------------------------------------------------------
    // Tier 2 only
    // --------------------------------------------------------

    if (tier !== 2) {

        return res.json({

            ok: false,

            invalidPair: true,

            reason:
                "Fusion requires Tier 2",

            serverNow:
                serverNow()
        });
    }

    if (!element) {

        return res.status(400).json({

            ok: false,

            error:
                "element is required",

            serverNow:
                serverNow()
        });
    }

    watch.element =
        element;

    watch.tier =
        tier;

    // --------------------------------------------------------
    // Fusion already active
    // --------------------------------------------------------

    if (roomData.activeEvent) {

        return res.json({

            ok: false,

            error:
                "Fusion already in progress",

            serverNow:
                serverNow()
        });
    }

    // --------------------------------------------------------
    // Same watch cannot bump itself
    // --------------------------------------------------------

    if (
        roomData.pendingBump &&
        roomData.pendingBump.watchID === watchID
    ) {

        return res.json({

            ok: true,

            waitingForPartner: true,

            serverNow:
                serverNow()
        });
    }

    // ========================================================
    // FIRST WATCH
    // ========================================================

    if (!roomData.pendingBump) {

        roomData.pendingBump = {

            watchID,

            element,

            tier,

            bumpID:
                bumpID || null,

            createdAt:
                serverNow()
        };

        roomData.updatedAt =
            serverNow();

        console.log(
            `👊 [BBBG] First bump: ${watchID} (${element})`
        );

        return res.json({

            ok: true,

            waitingForPartner: true,

            serverNow:
                serverNow()
        });
    }

    // ========================================================
    // SECOND WATCH
    // ========================================================

    const first =
        roomData.pendingBump;

    const second = {

        watchID,

        element,

        tier
    };

    console.log(
        `👊 [BBBG] Second bump: ${watchID} (${element})`
    );

    // --------------------------------------------------------
    // Validate pair
    // --------------------------------------------------------

    if (
        !isValidFusionPair(
            first.element,
            second.element
        )
    ) {

        console.log(
            `⚠️ [BBBG] Invalid fusion pair: ` +
            `${first.element} + ${second.element}`
        );

        return res.json({

            ok: false,

            invalidPair: true,

            waitingForPartner: true,

            serverNow:
                serverNow()
        });
    }

    // ========================================================
    // VALID PAIR
    // ========================================================

    const eventID =
        cryptoRandomID();

    const playAt =
        serverNow() +
        SOUND_START_DELAY_MS;

    roomData.activeEvent = {

        type:
            "FUSION_SOUND_START",

        eventID,

        firstWatchID:
            first.watchID,

        firstElement:
            first.element,

        firstTier:
            first.tier,

        secondWatchID:
            second.watchID,

        secondElement:
            second.element,

        secondTier:
            second.tier,

        playAt,

        soundFinished:
            new Set(),

        fusionCompleted:
            new Set()
    };

    roomData.pendingBump =
        null;

    roomData.updatedAt =
        serverNow();

    console.log(
        "🔥 [BBBG] VALID FUSION PAIR"
    );

    console.log(
        `   ${first.element} + ${second.element}`
    );

    console.log(
        `   Event: ${eventID}`
    );

    console.log(
        `   Play at: ${playAt}`
    );

    res.json({

        ok: true,

        fusionStarted: true,

        eventID,

        playAt,

        serverNow:
            serverNow()
    });
});

// ============================================================
// POLL
// ============================================================

app.get("/room/poll", (req, res) => {

    const {
        room,
        watchID
    } = req.query;

    if (!room || !watchID) {

        return res.status(400).json({

            ok: false,

            error:
                "room and watchID are required",

            serverNow:
                serverNow()
        });
    }

    const roomData =
        rooms.get(room);

    if (!roomData) {

        return res.status(404).json({

            ok: false,

            error:
                "Room not found",

            serverNow:
                serverNow()
        });
    }

    const watch =
        roomData.watches.get(watchID);

    if (!watch) {

        return res.status(404).json({

            ok: false,

            error:
                "Watch not registered",

            serverNow:
                serverNow()
        });
    }

    watch.lastSeen =
        serverNow();

    cleanupRoom(roomData);

    if (!roomData.activeEvent) {

        return res.json({

            ok: true,

            event: null,

            watchCount:
                roomData.watches.size,

            serverNow:
                serverNow()
        });
    }

    const active =
        roomData.activeEvent;

    const isParticipant =
        watchID === active.firstWatchID ||
        watchID === active.secondWatchID;

    if (!isParticipant) {

        return res.json({

            ok: true,

            event: null,

            watchCount:
                roomData.watches.size,

            serverNow:
                serverNow()
        });
    }

    const event = {

        type:
            active.type,

        eventID:
            active.eventID,

        firstWatchID:
            active.firstWatchID,

        firstElement:
            active.firstElement,

        firstTier:
            active.firstTier,

        secondWatchID:
            active.secondWatchID,

        secondElement:
            active.secondElement,

        secondTier:
            active.secondTier,

        playAt:
            active.playAt
    };

    res.json({

        ok: true,

        event,

        watchCount:
            roomData.watches.size,

        serverNow:
            serverNow()
    });
});

// ============================================================
// SOUND FINISHED
// ============================================================

app.post("/room/sound-finished", (req, res) => {

    const {
        room,
        watchID,
        eventID
    } = req.body;

    if (!room || !watchID || !eventID) {

        return res.status(400).json({

            ok: false,

            error:
                "room, watchID and eventID are required",

            serverNow:
                serverNow()
        });
    }

    const roomData =
        rooms.get(room);

    if (!roomData) {

        return res.status(404).json({

            ok: false,

            error:
                "Room not found",

            serverNow:
                serverNow()
        });
    }

    const watch =
        roomData.watches.get(watchID);

    if (!watch) {

        return res.status(404).json({

            ok: false,

            error:
                "Watch not registered",

            serverNow:
                serverNow()
        });
    }

    watch.lastSeen =
        serverNow();

    const active =
        roomData.activeEvent;

    if (!active) {

        return res.status(404).json({

            ok: false,

            error:
                "No active fusion event",

            serverNow:
                serverNow()
        });
    }

    if (
        active.eventID !== eventID
    ) {

        return res.status(409).json({

            ok: false,

            error:
                "Event ID does not match",

            serverNow:
                serverNow()
        });
    }

    const isParticipant =
        watchID === active.firstWatchID ||
        watchID === active.secondWatchID;

    if (!isParticipant) {

        return res.status(403).json({

            ok: false,

            error:
                "Watch is not part of this fusion",

            serverNow:
                serverNow()
        });
    }

    active.soundFinished.add(
        watchID
    );

    roomData.updatedAt =
        serverNow();

    const bothSoundsFinished =
        active.soundFinished.has(
            active.firstWatchID
        ) &&
        active.soundFinished.has(
            active.secondWatchID
        );

    console.log(
        `🔊 [BBBG] Sound finished: ${watchID}`
    );

    console.log(
        `   ${active.soundFinished.size}/2 watches finished`
    );

    if (bothSoundsFinished) {

        active.type =
            "FUSION_EXECUTE";

        console.log(
            "🔥 [BBBG] BOTH SOUNDS FINISHED"
        );

        console.log(
            "🔥 [BBBG] FUSION_EXECUTE READY"
        );
    }

    res.json({

        ok: true,

        soundFinished: true,

        bothSoundsFinished,

        serverNow:
            serverNow()
    });
});

// ============================================================
// FUSION COMPLETE
// ============================================================

app.post("/room/fusion-complete", (req, res) => {

    const {
        room,
        watchID,
        eventID
    } = req.body;

    if (!room || !watchID || !eventID) {

        return res.status(400).json({

            ok: false,

            error:
                "room, watchID and eventID are required",

            serverNow:
                serverNow()
        });
    }

    const roomData =
        rooms.get(room);

    if (!roomData) {

        return res.status(404).json({

            ok: false,

            error:
                "Room not found",

            serverNow:
                serverNow()
        });
    }

    const watch =
        roomData.watches.get(watchID);

    if (!watch) {

        return res.status(404).json({

            ok: false,

            error:
                "Watch not registered",

            serverNow:
                serverNow()
        });
    }

    watch.lastSeen =
        serverNow();

    const active =
        roomData.activeEvent;

    if (!active) {

        return res.status(404).json({

            ok: false,

            error:
                "No active fusion event",

            serverNow:
                serverNow()
        });
    }

    if (
        active.eventID !== eventID
    ) {

        return res.status(409).json({

            ok: false,

            error:
                "Event ID does not match",

            serverNow:
                serverNow()
        });
    }

    const isParticipant =
        watchID === active.firstWatchID ||
        watchID === active.secondWatchID;

    if (!isParticipant) {

        return res.status(403).json({

            ok: false,

            error:
                "Watch is not part of this fusion",

            serverNow:
                serverNow()
        });
    }

    if (
        active.type !==
        "FUSION_EXECUTE"
    ) {

        return res.status(409).json({

            ok: false,

            error:
                "Fusion cannot complete before FUSION_EXECUTE",

            serverNow:
                serverNow()
        });
    }

    active.fusionCompleted.add(
        watchID
    );

    roomData.updatedAt =
        serverNow();

    const bothCompleted =
        active.fusionCompleted.has(
            active.firstWatchID
        ) &&
        active.fusionCompleted.has(
            active.secondWatchID
        );

    console.log(
        `✅ [BBBG] Fusion complete: ${watchID}`
    );

    console.log(
        `   ${active.fusionCompleted.size}/2 watches completed`
    );

    if (bothCompleted) {

        console.log(
            "🎉 [BBBG] BOTH WATCHES COMPLETED FUSION"
        );

        roomData.activeEvent =
            null;

        roomData.updatedAt =
            serverNow();

        return res.json({

            ok: true,

            fusionComplete: true,

            roomReset: true,

            serverNow:
                serverNow()
        });
    }

    res.json({

        ok: true,

        fusionComplete: false,

        waitingForPartner: true,

        serverNow:
            serverNow()
    });
});

// ============================================================
// GENERIC EVENT
// ============================================================

app.post("/room/event", (req, res) => {

    const {
        room,
        watchID,
        event
    } = req.body;

    const roomData =
        rooms.get(room);

    if (!roomData) {

        return res.status(404).json({

            ok: false,

            error:
                "Room not found",

            serverNow:
                serverNow()
        });
    }

    const watch =
        roomData.watches.get(watchID);

    if (!watch) {

        return res.status(404).json({

            ok: false,

            error:
                "Watch not registered",

            serverNow:
                serverNow()
        });
    }

    watch.lastSeen =
        serverNow();

    console.log(
        `📡 [BBBG] Generic event from ${watchID}:`,
        event
    );

    res.json({

        ok: true,

        serverNow:
            serverNow()
    });
});

// ============================================================
// EVENT ID
// ============================================================

function cryptoRandomID() {

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 12)
    );
}

// ============================================================
// ROOM CLEANUP
// ============================================================

setInterval(() => {

    const now =
        serverNow();

    for (
        const [roomCode, room]
        of rooms.entries()
    ) {

        cleanupRoom(room);

        if (
            room.watches.size === 0 &&
            now - room.updatedAt >
                ROOM_TIMEOUT_MS
        ) {

            rooms.delete(
                roomCode
            );

            console.log(
                `🧹 [BBBG] Removed inactive room: ${roomCode}`
            );
        }
    }

}, 60 * 1000);

// ============================================================
// START
// ============================================================

app.listen(PORT, () => {

    console.log(
        `🚀 ${SERVER_NAME} running on port ${PORT}`
    );

});
