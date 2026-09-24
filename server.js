//
// server.js
// BBBG Fusion Server
//
// Prototype 1
//
// Apple Watch A
//      ↓
//    HTTPS
//      ↓
// BBBG Fusion Server
//      ↓
//    HTTPS
//      ↓
// Apple Watch B
//
// Supports:
//   FF = FrostFire
//   G  = Glacier
//   Gt = Gentar
//   S  = Supra
//   Sr = Sori
//   Sp = Sopan
//

const express = require("express");

const app = express();

app.use(express.json());

// ============================================================
// MARK: - PORT
// ============================================================

const PORT = process.env.PORT || 3000;

// ============================================================
// MARK: - ROOM STORAGE
// ============================================================

/*
Room structure:

rooms = {
    BBBG001: {
        watches: {
            WATCH_A: {
                watchID,
                app,
                element,
                tier,
                lastSeen
            },

            WATCH_B: {
                watchID,
                app,
                element,
                tier,
                lastSeen
            }
        },

        event: {
            id,
            type,
            sourceWatchID,
            targetWatchID,
            firstElement,
            secondElement,
            result,
            timestamp
        }
    }
}
*/

const rooms = new Map();

// ============================================================
// MARK: - HELPERS
// ============================================================

function getRoom(roomCode) {
    return rooms.get(roomCode);
}

function createRoom(roomCode) {
    const room = {
        watches: {},
        event: null
    };

    rooms.set(roomCode, room);

    return room;
}

function getOrCreateRoom(roomCode) {

    let room = getRoom(roomCode);

    if (!room) {
        room = createRoom(roomCode);
    }

    return room;
}

function now() {
    return Date.now();
}

// ============================================================
// MARK: - VALID FUSIONS
// ============================================================

/*
The server accepts these six fusion combinations.

Element names must match the Swift Element enum used
by FusionBLE.
*/

const FUSION_TABLE = {

    // Ice + Blaze
    "blaze|ice": "ff",

    // Ice + Quake
    "ice|quake": "g",

    // Thunder + Quake
    "quake|thunder": "gt",

    // Solar + Thunder
    "solar|thunder": "s",

    // Solar + Thorn
    "solar|thorn": "sr",

    // Solar + Cyclone
    "cyclone|solar": "sp"
};

// ============================================================
// MARK: - ELEMENT NORMALIZATION
// ============================================================

function normalizeElement(element) {

    if (!element) {
        return null;
    }

    return String(element)
        .trim()
        .toLowerCase();
}

// ============================================================
// MARK: - FUSION RESULT
// ============================================================

function calculateFusion(firstElement, secondElement) {

    const first =
        normalizeElement(firstElement);

    const second =
        normalizeElement(secondElement);

    if (!first || !second) {
        return null;
    }

    const sorted = [
        first,
        second
    ].sort();

    const key =
        `${sorted[0]}|${sorted[1]}`;

    return FUSION_TABLE[key] || null;
}

// ============================================================
// MARK: - HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {

    res.json({
        server: "BBBG Fusion Server",
        status: "online",
        prototype: "Prototype 1",

        supportedFusions: [
            "ff",
            "g",
            "gt",
            "s",
            "sr",
            "sp"
        ],

        timestamp: now()
    });
});

// ============================================================
// MARK: - REGISTER WATCH
// ============================================================

app.post("/room/register", (req, res) => {

    const {
        roomCode,
        watchID,
        app: appName
    } = req.body;

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!roomCode || !watchID) {

        return res.status(400).json({
            error: "roomCode and watchID are required"
        });
    }

    const room =
        getOrCreateRoom(roomCode);

    // --------------------------------------------------------
    // Already registered
    // --------------------------------------------------------

    if (room.watches[watchID]) {

        room.watches[watchID].lastSeen = now();

        if (appName) {
            room.watches[watchID].app = appName;
        }

        return res.json({
            success: true,
            message: "Watch already registered",
            roomCode,
            watchID,
            watchCount: Object.keys(room.watches).length
        });
    }

    // --------------------------------------------------------
    // Maximum 2 watches
    // --------------------------------------------------------

    const watchCount =
        Object.keys(room.watches).length;

    if (watchCount >= 2) {

        return res.status(409).json({
            error: "Room already has two Watches",
            roomCode,
            watchCount
        });
    }

    // --------------------------------------------------------
    // Register
    // --------------------------------------------------------

    room.watches[watchID] = {

        watchID,

        app: appName || "BBBG",

        element: null,

        tier: 0,

        lastSeen: now()
    };

    console.log(
        `📱 WATCH REGISTERED`,
        roomCode,
        watchID
    );

    return res.json({

        success: true,

        message: "Watch registered",

        roomCode,

        watchID,

        watchCount:
            Object.keys(room.watches).length
    });
});

// ============================================================
// MARK: - UPDATE WATCH STATE
// ============================================================

app.post("/room/state", (req, res) => {

    const {
        roomCode,
        watchID,
        element,
        tier,
        app: appName
    } = req.body;

    if (!roomCode || !watchID) {

        return res.status(400).json({
            error: "roomCode and watchID are required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({
            error: "Room not found"
        });
    }

    const watch =
        room.watches[watchID];

    if (!watch) {

        return res.status(404).json({
            error: "Watch not registered"
        });
    }

    // --------------------------------------------------------
    // Update state
    // --------------------------------------------------------

    if (element !== undefined) {

        watch.element =
            normalizeElement(element);
    }

    if (tier !== undefined) {

        watch.tier =
            Number(tier);
    }

    if (appName) {

        watch.app =
            appName;
    }

    watch.lastSeen = now();

    console.log(
        `📡 STATE`,
        roomCode,
        watchID,
        watch.element,
        `Tier ${watch.tier}`
    );

    return res.json({

        success: true,

        roomCode,

        watchID,

        element: watch.element,

        tier: watch.tier,

        lastSeen: watch.lastSeen
    });
});

// ============================================================
// MARK: - FIST BUMP
// ============================================================

app.post("/room/bump", (req, res) => {

    const {
        roomCode,
        watchID,
        eventID,
        element,
        tier
    } = req.body;

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!roomCode || !watchID) {

        return res.status(400).json({
            error: "roomCode and watchID are required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({
            error: "Room not found"
        });
    }

    const sourceWatch =
        room.watches[watchID];

    if (!sourceWatch) {

        return res.status(404).json({
            error: "Watch not registered"
        });
    }

    // --------------------------------------------------------
    // Find other Watch
    // --------------------------------------------------------

    const otherWatchID =
        Object.keys(room.watches)
            .find(id => id !== watchID);

    if (!otherWatchID) {

        return res.status(409).json({
            error: "Waiting for second Watch"
        });
    }

    const otherWatch =
        room.watches[otherWatchID];

    // --------------------------------------------------------
    // Update source Watch state
    // --------------------------------------------------------

    sourceWatch.element =
        normalizeElement(element);

    sourceWatch.tier =
        Number(tier);

    sourceWatch.lastSeen =
        now();

    // --------------------------------------------------------
    // Check Tier
    // --------------------------------------------------------

    if (sourceWatch.tier < 2) {

        return res.status(400).json({

            error:
                "Fusion requires Tier 2 elements",

            tier:
                sourceWatch.tier
        });
    }

    if (otherWatch.tier < 2) {

        return res.status(400).json({

            error:
                "Other Watch is not using Tier 2",

            otherTier:
                otherWatch.tier
        });
    }

    // --------------------------------------------------------
    // Check elements
    // --------------------------------------------------------

    if (!sourceWatch.element) {

        return res.status(400).json({
            error: "Source Watch has no element"
        });
    }

    if (!otherWatch.element) {

        return res.status(400).json({
            error: "Other Watch has no element"
        });
    }

    // --------------------------------------------------------
    // Calculate fusion
    // --------------------------------------------------------

    const result =
        calculateFusion(
            sourceWatch.element,
            otherWatch.element
        );

    // --------------------------------------------------------
    // Invalid combination
    // --------------------------------------------------------

    if (!result) {

        console.log(
            `❌ NO FUSION`,
            sourceWatch.element,
            "+",
            otherWatch.element
        );

        return res.status(400).json({

            error:
                "Invalid fusion combination",

            firstElement:
                sourceWatch.element,

            secondElement:
                otherWatch.element
        });
    }

    // --------------------------------------------------------
    // Create event
    // --------------------------------------------------------

    const finalEventID =
        eventID ||
        `${watchID}-${now()}`;

    const event = {

        id: finalEventID,

        type: "BUMP",

        sourceWatchID:
            watchID,

        targetWatchID:
            otherWatchID,

        firstElement:
            sourceWatch.element,

        secondElement:
            otherWatch.element,

        result,

        timestamp:
            now()
    };

    room.event = event;

    // --------------------------------------------------------
    // Log
    // --------------------------------------------------------

    console.log("");
    console.log("🤜🤛 FIST BUMP");
    console.log(
        "Room:",
        roomCode
    );
    console.log(
        "Source:",
        watchID
    );
    console.log(
        "Target:",
        otherWatchID
    );
    console.log(
        "Elements:",
        sourceWatch.element,
        "+",
        otherWatch.element
    );
    console.log(
        "Fusion:",
        result
    );
    console.log(
        "Event:",
        finalEventID
    );
    console.log("");

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    return res.json({

        success: true,

        event: event
    });
});

// ============================================================
// MARK: - CREATE / UPDATE FUSION EVENT
// ============================================================

app.post("/room/event", (req, res) => {

    const {
        roomCode,
        watchID,
        eventID,
        type,
        result,
        firstElement,
        secondElement
    } = req.body;

    if (!roomCode || !watchID) {

        return res.status(400).json({
            error: "roomCode and watchID are required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({
            error: "Room not found"
        });
    }

    const watch =
        room.watches[watchID];

    if (!watch) {

        return res.status(404).json({
            error: "Watch not registered"
        });
    }

    // --------------------------------------------------------
    // If a fusion result was supplied, validate it
    // --------------------------------------------------------

    if (result) {

        const calculated =
            calculateFusion(
                firstElement,
                secondElement
            );

        if (
            calculated &&
            calculated !== result
        ) {

            return res.status(400).json({

                error:
                    "Fusion result does not match elements",

                calculated,

                supplied:
                    result
            });
        }
    }

    // --------------------------------------------------------
    // Preserve existing event
    // --------------------------------------------------------

    const existingEvent =
        room.event;

    const event = {

        id:
            eventID ||
            existingEvent?.id ||
            `${watchID}-${now()}`,

        type:
            type ||
            "FUSION_RESULT",

        sourceWatchID:
            existingEvent?.sourceWatchID ||
            watchID,

        targetWatchID:
            existingEvent?.targetWatchID ||
            Object.keys(room.watches)
                .find(id => id !== watchID) ||
            null,

        firstElement:
            firstElement ||
            existingEvent?.firstElement ||
            null,

        secondElement:
            secondElement ||
            existingEvent?.secondElement ||
            null,

        result:
            result ||
            existingEvent?.result ||
            null,

        timestamp:
            now()
    };

    room.event = event;

    console.log(
        `⚡ FUSION EVENT`,
        roomCode,
        event.result
    );

    return res.json({

        success: true,

        event
    });
});

// ============================================================
// MARK: - POLL
// ============================================================

app.get("/room/poll", (req, res) => {

    const {
        roomCode,
        watchID,
        since
    } = req.query;

    if (!roomCode || !watchID) {

        return res.status(400).json({
            error: "roomCode and watchID are required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({
            error: "Room not found"
        });
    }

    const watch =
        room.watches[watchID];

    if (!watch) {

        return res.status(404).json({
            error: "Watch not registered"
        });
    }

    watch.lastSeen = now();

    // --------------------------------------------------------
    // Other Watch
    // --------------------------------------------------------

    const otherWatchID =
        Object.keys(room.watches)
            .find(id => id !== watchID);

    const otherWatch =
        otherWatchID
            ? room.watches[otherWatchID]
            : null;

    // --------------------------------------------------------
    // Event filtering
    // --------------------------------------------------------

    let event = room.event;

    if (since && event) {

        const sinceNumber =
            Number(since);

        if (
            Number.isFinite(sinceNumber) &&
            event.timestamp <= sinceNumber
        ) {
            event = null;
        }
    }

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    return res.json({

        success: true,

        roomCode,

        watchID,

        otherWatch:
            otherWatch
                ? {
                    watchID:
                        otherWatch.watchID,

                    app:
                        otherWatch.app,

                    element:
                        otherWatch.element,

                    tier:
                        otherWatch.tier,

                    lastSeen:
                        otherWatch.lastSeen
                }
                : null,

        event
    });
});

// ============================================================
// MARK: - RESET ROOM
// ============================================================

app.post("/room/reset", (req, res) => {

    const {
        roomCode
    } = req.body;

    if (!roomCode) {

        return res.status(400).json({
            error: "roomCode is required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({
            error: "Room not found"
        });
    }

    room.event = null;

    Object.values(room.watches)
        .forEach(watch => {

            watch.element = null;
            watch.tier = 0;
        });

    console.log(
        `🔄 ROOM RESET: ${roomCode}`
    );

    return res.json({

        success: true,

        message:
            "Room reset",

        roomCode
    });
});

// ============================================================
// MARK: - DEBUG ROOM
// ============================================================

app.get("/room/:roomCode", (req, res) => {

    const roomCode =
        req.params.roomCode;

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({
            error: "Room not found"
        });
    }

    return res.json({

        roomCode,

        watches:
            room.watches,

        event:
            room.event
    });
});

// ============================================================
// MARK: - START SERVER
// ============================================================

app.listen(PORT, () => {

    console.log("");
    console.log("==========================================");
    console.log("   BBBG FUSION SERVER");
    console.log("==========================================");
    console.log("");
    console.log(
        `🚀 Server running on port ${PORT}`
    );
    console.log("");
    console.log("Supported fusions:");
    console.log("🔥 Ice + Blaze     = FF");
    console.log("❄️  Ice + Quake     = G");
    console.log("⚡ Thunder + Quake  = Gt");
    console.log("☀️  Solar + Thunder = S");
    console.log("🌞 Solar + Thorn    = Sr");
    console.log("🌪️  Solar + Cyclone = Sp");
    console.log("");
    console.log("==========================================");
    console.log("");
});
