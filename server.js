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
// Fusion calculation remains CLIENT-SIDE.
//
// Supported:
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

const rooms = new Map();

// ============================================================
// MARK: - HELPERS
// ============================================================

function now() {
    return Date.now();
}

function normalizeElement(element) {

    if (!element) {
        return null;
    }

    return String(element)
        .trim()
        .toLowerCase();
}

function getRoom(roomCode) {
    return rooms.get(roomCode);
}

function getOrCreateRoom(roomCode) {

    let room = rooms.get(roomCode);

    if (!room) {

        room = {
            watches: {},
            event: null
        };

        rooms.set(roomCode, room);
    }

    return room;
}

function getRoomCode(body) {

    return body.roomCode || body.room || null;
}

// ============================================================
// MARK: - SIX FUSIONS
// ============================================================

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
// MARK: - CALCULATE FUSION
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
// MARK: - BUILD SWIFT BUMP EVENT
// ============================================================

/*
    IMPORTANT

    This function creates the exact JSON structure
    expected by FusionBLE.ServerEvent:

        watchID
        eventID
        type
        element
        tier
        result
        createdAt
*/

function makeBumpEvent({
    watchID,
    eventID,
    element,
    tier,
    result
}) {

    return {

        watchID:
            watchID,

        eventID:
            eventID,

        type:
            "BUMP",

        element:
            normalizeElement(element),

        tier:
            Number(tier),

        result:
            result || null,

        createdAt:
            now()
    };
}

// ============================================================
// MARK: - BUILD FUSION RESULT EVENT
// ============================================================

function makeFusionResultEvent({
    watchID,
    eventID,
    result,
    element,
    tier
}) {

    return {

        watchID:
            watchID,

        eventID:
            eventID,

        type:
            "FUSION_RESULT",

        element:
            normalizeElement(element) || "",

        tier:
            Number(tier || 0),

        result:
            result,

        createdAt:
            now()
    };
}

// ============================================================
// MARK: - HEALTH CHECK
// ============================================================

app.get("/", (req, res) => {

    res.json({

        server:
            "BBBG Fusion Server",

        status:
            "online",

        prototype:
            "Prototype 1",

        supportedFusions: [

            "ff",
            "g",
            "gt",
            "s",
            "sr",
            "sp"
        ],

        timestamp:
            now()
    });
});

// ============================================================
// MARK: - REGISTER WATCH
// ============================================================

app.post("/room/register", (req, res) => {

    const roomCode =
        getRoomCode(req.body);

    const {
        watchID,
        app: appName,
        element,
        tier
    } = req.body;

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!roomCode || !watchID) {

        return res.status(400).json({

            error:
                "room/roomCode and watchID are required"
        });
    }

    // --------------------------------------------------------
    // Get room
    // --------------------------------------------------------

    const room =
        getOrCreateRoom(roomCode);

    // --------------------------------------------------------
    // Existing Watch
    // --------------------------------------------------------

    if (room.watches[watchID]) {

        const watch =
            room.watches[watchID];

        watch.lastSeen =
            now();

        if (appName) {
            watch.app =
                appName;
        }

        if (element !== undefined) {

            watch.element =
                normalizeElement(element);
        }

        if (tier !== undefined) {

            watch.tier =
                Number(tier);
        }

        console.log(
            `🔄 WATCH RECONNECTED: ${watchID}`
        );

        return res.json({

            success:
                true,

            message:
                "Watch already registered",

            roomCode,

            watchID,

            watchCount:
                Object.keys(room.watches).length
        });
    }

    // --------------------------------------------------------
    // Maximum two Watches
    // --------------------------------------------------------

    const watchCount =
        Object.keys(room.watches).length;

    if (watchCount >= 2) {

        return res.status(409).json({

            error:
                "Room already has two Watches",

            roomCode,

            watchCount
        });
    }

    // --------------------------------------------------------
    // Register
    // --------------------------------------------------------

    room.watches[watchID] = {

        watchID,

        app:
            appName || "BBBG",

        element:
            element
                ? normalizeElement(element)
                : null,

        tier:
            tier !== undefined
                ? Number(tier)
                : 1,

        lastSeen:
            now()
    };

    console.log("");
    console.log("📱 WATCH REGISTERED");
    console.log(
        "Room:",
        roomCode
    );
    console.log(
        "Watch:",
        watchID
    );
    console.log(
        "Element:",
        room.watches[watchID].element
    );
    console.log(
        "Tier:",
        room.watches[watchID].tier
    );
    console.log("");

    return res.json({

        success:
            true,

        message:
            "Watch registered",

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

    const roomCode =
        getRoomCode(req.body);

    const {
        watchID,
        element,
        tier,
        app: appName
    } = req.body;

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!roomCode || !watchID) {

        return res.status(400).json({

            error:
                "room/roomCode and watchID are required"
        });
    }

    // --------------------------------------------------------
    // Room
    // --------------------------------------------------------

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({

            error:
                "Room not found"
        });
    }

    // --------------------------------------------------------
    // Watch
    // --------------------------------------------------------

    const watch =
        room.watches[watchID];

    if (!watch) {

        return res.status(404).json({

            error:
                "Watch not registered"
        });
    }

    // --------------------------------------------------------
    // Update
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

    watch.lastSeen =
        now();

    console.log(
        `📡 STATE ${roomCode} ${watchID} ` +
        `${watch.element} Tier ${watch.tier}`
    );

    return res.json({

        success:
            true,

        roomCode,

        watchID,

        element:
            watch.element,

        tier:
            watch.tier,

        lastSeen:
            watch.lastSeen
    });
});

// ============================================================
// MARK: - FIST BUMP
// ============================================================

app.post("/room/bump", (req, res) => {

    const roomCode =
        getRoomCode(req.body);

    const {
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

            error:
                "room/roomCode and watchID are required"
        });
    }

    // --------------------------------------------------------
    // Room
    // --------------------------------------------------------

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({

            error:
                "Room not found"
        });
    }

    // --------------------------------------------------------
    // Source Watch
    // --------------------------------------------------------

    const sourceWatch =
        room.watches[watchID];

    if (!sourceWatch) {

        return res.status(404).json({

            error:
                "Watch not registered"
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

            error:
                "Waiting for second Watch"
        });
    }

    const otherWatch =
        room.watches[otherWatchID];

    // --------------------------------------------------------
    // Update source state
    // --------------------------------------------------------

    sourceWatch.element =
        normalizeElement(element);

    sourceWatch.tier =
        Number(tier);

    sourceWatch.lastSeen =
        now();

    // --------------------------------------------------------
    // Tier validation
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
    // Element validation
    // --------------------------------------------------------

    if (!sourceWatch.element) {

        return res.status(400).json({

            error:
                "Source Watch has no element"
        });
    }

    if (!otherWatch.element) {

        return res.status(400).json({

            error:
                "Other Watch has no element"
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

        console.log("");
        console.log("❌ NO FUSION");
        console.log(
            sourceWatch.element,
            "+",
            otherWatch.element
        );
        console.log("");

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
    // Event ID
    // --------------------------------------------------------

    const finalEventID =
        eventID ||
        `${watchID}-${now()}`;

    // --------------------------------------------------------
    // IMPORTANT
    //
    // The BUMP event uses the source Watch's element.
    //
    // The receiving Watch already knows its own element
    // through /room/poll → otherWatch.
    //
    // FusionBLE then calculates:
    //
    // localElement + remoteElement
    //
    // --------------------------------------------------------

    const event =
        makeBumpEvent({

            watchID:
                watchID,

            eventID:
                finalEventID,

            element:
                sourceWatch.element,

            tier:
                sourceWatch.tier,

            result:
                result
        });

    // --------------------------------------------------------
    // Store event
    // --------------------------------------------------------

    room.event =
        event;

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
        "Source Element:",
        sourceWatch.element
    );
    console.log(
        "Remote Element:",
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

        success:
            true,

        event:
            event
    });
});

// ============================================================
// MARK: - FUSION RESULT EVENT
// ============================================================

app.post("/room/event", (req, res) => {

    const roomCode =
        getRoomCode(req.body);

    const {
        watchID,
        eventID,
        type,
        result
    } = req.body;

    if (!roomCode || !watchID) {

        return res.status(400).json({

            error:
                "room/roomCode and watchID are required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({

            error:
                "Room not found"
        });
    }

    const watch =
        room.watches[watchID];

    if (!watch) {

        return res.status(404).json({

            error:
                "Watch not registered"
        });
    }

    // --------------------------------------------------------
    // Only accept valid fusion result
    // --------------------------------------------------------

    if (type === "FUSION_RESULT") {

        const validResults = [
            "ff",
            "g",
            "gt",
            "s",
            "sr",
            "sp"
        ];

        if (!validResults.includes(result)) {

            return res.status(400).json({

                error:
                    "Invalid fusion result",

                result
            });
        }

        const existingEvent =
            room.event;

        const finalEventID =
            eventID ||
            existingEvent?.eventID ||
            `${watchID}-${now()}`;

        /*
         IMPORTANT:

         Preserve the BUMP event's element and tier
         because FusionBLE's ServerEvent expects them.
        */

        const event =
            makeFusionResultEvent({

                watchID:
                    watchID,

                eventID:
                    finalEventID,

                result:
                    result,

                element:
                    existingEvent?.element || "",

                tier:
                    existingEvent?.tier || 0
            });

        room.event =
            event;

        console.log("");
        console.log("⚡ FUSION RESULT");
        console.log(
            "Room:",
            roomCode
        );
        console.log(
            "Watch:",
            watchID
        );
        console.log(
            "Result:",
            result
        );
        console.log(
            "Event:",
            finalEventID
        );
        console.log("");

        return res.json({

            success:
                true,

            event:
                event
        });
    }

    return res.status(400).json({

        error:
            "Unsupported event type"
    });
});

// ============================================================
// MARK: - POLL
// ============================================================

app.get("/room/poll", (req, res) => {

    const roomCode =
        req.query.roomCode ||
        req.query.room;

    const watchID =
        req.query.watchID;

    const since =
        req.query.since;

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!roomCode || !watchID) {

        return res.status(400).json({

            error:
                "room/roomCode and watchID are required"
        });
    }

    // --------------------------------------------------------
    // Room
    // --------------------------------------------------------

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({

            error:
                "Room not found"
        });
    }

    // --------------------------------------------------------
    // Watch
    // --------------------------------------------------------

    const watch =
        room.watches[watchID];

    if (!watch) {

        return res.status(404).json({

            error:
                "Watch not registered"
        });
    }

    watch.lastSeen =
        now();

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
    // Event
    // --------------------------------------------------------

    let event =
        room.event;

    if (since && event) {

        const sinceNumber =
            Number(since);

        if (
            Number.isFinite(sinceNumber) &&
            event.createdAt <= sinceNumber
        ) {

            event = null;
        }
    }

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    return res.json({

        success:
            true,

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

        event:
            event
    });
});

// ============================================================
// MARK: - RESET ROOM
// ============================================================

app.post("/room/reset", (req, res) => {

    const roomCode =
        getRoomCode(req.body);

    if (!roomCode) {

        return res.status(400).json({

            error:
                "room/roomCode is required"
        });
    }

    const room =
        getRoom(roomCode);

    if (!room) {

        return res.status(404).json({

            error:
                "Room not found"
        });
    }

    room.event =
        null;

    Object.values(room.watches)
        .forEach(watch => {

            watch.element =
                null;

            watch.tier =
                1;

            watch.lastSeen =
                now();
        });

    console.log(
        `🔄 ROOM RESET: ${roomCode}`
    );

    return res.json({

        success:
            true,

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

            error:
                "Room not found"
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
    console.log("       BBBG FUSION SERVER");
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
