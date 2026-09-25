//
// server.js
// BBBG Fusion Server
//
// Prototype 1
//
// Apple Watch A
//       ↓
//     HTTPS
//       ↓
// BBBG Fusion Server
//       ↓
//     HTTPS
//       ↓
// Apple Watch B
//
// Fusion calculation remains SERVER-SIDE.
//
// Important:
// - Both watches must perform a fist bump.
// - A fusion is created only after BOTH watches bump.
// - Every fusion gets a NEW fusionID/eventID.
// - The same fusion event is delivered to BOTH watches.
// - Each watch acknowledges the fusion.
// - The server does not require a timing limit.
// - Fusion #2, #3, #4... work independently.
//

const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============================================================
// MARK: - ROOM STORAGE
// ============================================================

const rooms = new Map();

// Room:
//
// {
//     watches: {
//         watchID: {
//             watchID,
//             app,
//             element,
//             tier,
//             lastSeen,
//             bump: {
//                 eventID,
//                 element,
//                 tier,
//                 createdAt
//             }
//         }
//     },
//
//     fusion: {
//         fusionID,
//         eventID,
//         type,
//         result,
//         createdAt,
//         sourceWatchID,
//         targetWatchID,
//         watches: {
//             watchA: false,
//             watchB: false
//         }
//     } | null
//
// }


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
            fusion: null
        };

        rooms.set(roomCode, room);
    }

    return room;
}

function getRoomCode(body) {
    return body.roomCode || body.room || null;
}

function makeID(prefix) {
    return `${prefix}-${now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}`;
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
// MARK: - CREATE FUSION EVENT
// ============================================================

function makeFusionEvent({
    fusionID,
    eventID,
    sourceWatchID,
    targetWatchID,
    sourceElement,
    targetElement,
    sourceTier,
    targetTier,
    result
}) {

    return {

        type: "FUSION",

        fusionID,

        eventID,

        sourceWatchID,

        targetWatchID,

        sourceElement:
            normalizeElement(sourceElement),

        targetElement:
            normalizeElement(targetElement),

        sourceTier:
            Number(sourceTier),

        targetTier:
            Number(targetTier),

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
    // Room
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
            element !== undefined
                ? normalizeElement(element)
                : null,

        tier:
            tier !== undefined
                ? Number(tier)
                : 1,

        lastSeen:
            now(),

        bump:
            null
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
        "App:",
        room.watches[watchID].app
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
//
// IMPORTANT:
//
// A single bump does NOT create a fusion.
//
// First watch:
//
//     BUMP A
//        ↓
//     WAIT
//
// Second watch:
//
//     BUMP B
//        ↓
//     CREATE FUSION
//
// This means both watches must physically perform the
// soft fist bump before fusion happens.
//

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
    // Other Watch
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

    if (element !== undefined) {

        sourceWatch.element =
            normalizeElement(element);
    }

    if (tier !== undefined) {

        sourceWatch.tier =
            Number(tier);
    }

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
    // IMPORTANT:
    //
    // Record THIS watch's bump.
    //
    // Do not immediately create fusion.
    //
    // This is what allows both watches to bump.
    // --------------------------------------------------------

    const bumpID =
        eventID ||
        makeID("bump");

    sourceWatch.bump = {

        eventID:
            bumpID,

        element:
            sourceWatch.element,

        tier:
            sourceWatch.tier,

        createdAt:
            now()
    };


    console.log("");
    console.log("🤜🤛 BUMP RECEIVED");
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
        sourceWatch.element
    );
    console.log(
        "Tier:",
        sourceWatch.tier
    );
    console.log("");


    // --------------------------------------------------------
    // Check whether OTHER watch has also bumped
    // --------------------------------------------------------

    if (!otherWatch.bump) {

        return res.json({

            success:
                true,

            status:
                "WAITING_FOR_OTHER_WATCH",

            roomCode,

            watchID,

            bumpID
        });
    }


    // ========================================================
    // BOTH WATCHES HAVE BUMPED
    // ========================================================

    console.log("");
    console.log("🤜🤛 BOTH WATCHES BUMPED");
    console.log(
        "Watch A:",
        sourceWatch.watchID
    );
    console.log(
        "Watch B:",
        otherWatch.watchID
    );
    console.log("");


    // --------------------------------------------------------
    // Calculate fusion
    // --------------------------------------------------------

    const result =
        calculateFusion(
            sourceWatch.bump.element,
            otherWatch.bump.element
        );


    // --------------------------------------------------------
    // Invalid combination
    // --------------------------------------------------------

    if (!result) {

        console.log("");
        console.log("❌ NO FUSION");
        console.log(
            sourceWatch.bump.element,
            "+",
            otherWatch.bump.element
        );
        console.log("");

        // Clear both bumps so they can try again.
        sourceWatch.bump = null;
        otherWatch.bump = null;

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
    // Create NEW fusion transaction
    // --------------------------------------------------------

    const fusionID =
        makeID("fusion");

    const finalEventID =
        makeID("event");


    const fusionEvent =
        makeFusionEvent({

            fusionID,

            eventID:
                finalEventID,

            sourceWatchID:
                sourceWatch.watchID,

            targetWatchID:
                otherWatch.watchID,

            sourceElement:
                sourceWatch.bump.element,

            targetElement:
                otherWatch.bump.element,

            sourceTier:
                sourceWatch.bump.tier,

            targetTier:
                otherWatch.bump.tier,

            result
        });


    // --------------------------------------------------------
    // Store fusion transaction
    // --------------------------------------------------------

    room.fusion = {

        fusionID,

        eventID:
            finalEventID,

        type:
            "FUSION",

        result,

        createdAt:
            fusionEvent.createdAt,

        sourceWatchID:
            sourceWatch.watchID,

        targetWatchID:
            otherWatch.watchID,

        event:
            fusionEvent,

        acknowledgedBy: {}

    };


    // --------------------------------------------------------
    // Clear bumps
    //
    // IMPORTANT:
    //
    // The bump has already been converted into a fusion.
    // Clearing bump allows the SAME TWO WATCHES to perform
    // another fusion later.
    // --------------------------------------------------------

    sourceWatch.bump = null;
    otherWatch.bump = null;


    // --------------------------------------------------------
    // Log
    // --------------------------------------------------------

    console.log("");
    console.log("==========================================");
    console.log("🔥 FUSION CREATED");
    console.log("==========================================");
    console.log(
        "Room:",
        roomCode
    );
    console.log(
        "Fusion ID:",
        fusionID
    );
    console.log(
        "Event ID:",
        finalEventID
    );
    console.log(
        "Watch A:",
        sourceWatch.watchID
    );
    console.log(
        "Element A:",
        fusionEvent.sourceElement
    );
    console.log(
        "Watch B:",
        otherWatch.watchID
    );
    console.log(
        "Element B:",
        fusionEvent.targetElement
    );
    console.log(
        "Result:",
        result
    );
    console.log("==========================================");
    console.log("");


    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    return res.json({

        success:
            true,

        status:
            "FUSION_CREATED",

        roomCode,

        fusionID,

        eventID:
            finalEventID,

        result,

        event:
            fusionEvent
    });
});


// ============================================================
// MARK: - FUSION ACKNOWLEDGEMENT
// ============================================================
//
// Each watch calls this after it has received and activated
// the fusion.
//
// Example:
//
// Watch A → ACK fusion-123
// Watch B → ACK fusion-123
//
// Once both have acknowledged, the server clears the fusion.
//

app.post("/room/event", (req, res) => {

    const roomCode =
        getRoomCode(req.body);

    const {
        watchID,
        eventID,
        fusionID,
        type,
        result
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
    // Only FUSION_RESULT is accepted
    // --------------------------------------------------------

    if (type !== "FUSION_RESULT") {

        return res.status(400).json({

            error:
                "Unsupported event type"
        });
    }


    // --------------------------------------------------------
    // Current fusion
    // --------------------------------------------------------

    const fusion =
        room.fusion;

    if (!fusion) {

        return res.status(404).json({

            error:
                "No active fusion"
        });
    }


    // --------------------------------------------------------
    // Verify fusion ID
    // --------------------------------------------------------

    if (
        fusionID &&
        fusion.fusionID !== fusionID
    ) {

        return res.status(409).json({

            error:
                "Fusion ID does not match active fusion",

            activeFusionID:
                fusion.fusionID,

            receivedFusionID:
                fusionID
        });
    }


    // --------------------------------------------------------
    // Verify event ID
    // --------------------------------------------------------

    if (
        eventID &&
        fusion.eventID !== eventID
    ) {

        return res.status(409).json({

            error:
                "Event ID does not match active fusion",

            activeEventID:
                fusion.eventID,

            receivedEventID:
                eventID
        });
    }


    // --------------------------------------------------------
    // Verify result
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // ACK
    // --------------------------------------------------------

    fusion.acknowledgedBy[watchID] =
        now();


    console.log("");
    console.log("✅ FUSION ACK");
    console.log(
        "Room:",
        roomCode
    );
    console.log(
        "Watch:",
        watchID
    );
    console.log(
        "Fusion:",
        fusion.fusionID
    );
    console.log(
        "Result:",
        result
    );
    console.log("");


    // --------------------------------------------------------
    // Count acknowledgements
    // --------------------------------------------------------

    const registeredWatchIDs =
        Object.keys(room.watches);

    const acknowledgedWatchIDs =
        Object.keys(fusion.acknowledgedBy);

    const allAcknowledged =
        registeredWatchIDs.length >= 2 &&
        registeredWatchIDs.every(
            id =>
                acknowledgedWatchIDs.includes(id)
        );


    // --------------------------------------------------------
    // Both watches finished
    // --------------------------------------------------------

    if (allAcknowledged) {

        console.log("");
        console.log("==========================================");
        console.log("✅ BOTH WATCHES ACKNOWLEDGED FUSION");
        console.log("==========================================");
        console.log(
            "Fusion:",
            fusion.fusionID
        );
        console.log(
            "Result:",
            fusion.result
        );
        console.log("==========================================");
        console.log("");


        // Clear completed fusion.
        room.fusion = null;


        return res.json({

            success:
                true,

            status:
                "FUSION_COMPLETED",

            roomCode,

            fusionID:
                fusion.fusionID,

            eventID:
                fusion.eventID,

            result:
                fusion.result
        });
    }


    // --------------------------------------------------------
    // Still waiting
    // --------------------------------------------------------

    return res.json({

        success:
            true,

        status:
            "WAITING_FOR_OTHER_ACK",

        roomCode,

        fusionID:
            fusion.fusionID,

        eventID:
            fusion.eventID,

        result:
            fusion.result,

        acknowledgedBy:
            Object.keys(fusion.acknowledgedBy)
    });
});


// ============================================================
// MARK: - POLL
// ============================================================
//
// Each watch polls this endpoint.
//
// The same active fusion is returned to BOTH watches.
//
// A watch that already acknowledged the fusion can still
// receive the event safely, but FusionBLE should ignore an
// already-processed fusionID.
//

app.get("/room/poll", (req, res) => {

    const roomCode =
        req.query.roomCode ||
        req.query.room;

    const watchID =
        req.query.watchID;


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
    // Active fusion
    // --------------------------------------------------------

    let fusion =
        room.fusion;


    // --------------------------------------------------------
    // IMPORTANT:
    //
    // Do NOT use the client's old timestamp to delete the
    // fusion event.
    //
    // The fusion remains available until BOTH watches ACK it.
    //
    // This fixes the repeated-fusion problem.
    // --------------------------------------------------------


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
                        otherWatch.lastSeen,

                    hasBumped:
                        otherWatch.bump !== null
                }
                : null,

        fusion:
            fusion
                ? {

                    fusionID:
                        fusion.fusionID,

                    eventID:
                        fusion.eventID,

                    type:
                        fusion.type,

                    result:
                        fusion.result,

                    sourceWatchID:
                        fusion.sourceWatchID,

                    targetWatchID:
                        fusion.targetWatchID,

                    event:
                        fusion.event,

                    acknowledgedBy:
                        Object.keys(
                            fusion.acknowledgedBy
                        ),

                    createdAt:
                        fusion.createdAt
                }
                : null
    });
});


// ============================================================
// MARK: - RESET ROOM
// ============================================================

app.post("/room/reset", (req, res) => {

    const roomCode =
        getRoomCode(req.body);


    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    if (!roomCode) {

        return res.status(400).json({

            error:
                "room/roomCode is required"
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
    // Clear fusion
    // --------------------------------------------------------

    room.fusion =
        null;


    // --------------------------------------------------------
    // Reset watches
    // --------------------------------------------------------

    Object.values(room.watches)
        .forEach(watch => {

            watch.element =
                null;

            watch.tier =
                1;

            watch.bump =
                null;

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

        fusion:
            room.fusion
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

    console.log(
        "🔥 Ice + Blaze     = FF"
    );

    console.log(
        "❄️  Ice + Quake     = G"
    );

    console.log(
        "⚡ Thunder + Quake  = Gt"
    );

    console.log(
        "☀️  Solar + Thunder = S"
    );

    console.log(
        "🌞 Solar + Thorn    = Sr"
    );

    console.log(
        "🌪️  Solar + Cyclone = Sp"
    );

    console.log("");

    console.log(
        "🤜🤛 Two-watch bump synchronization: ENABLED"
    );

    console.log(
        "🔁 Repeated fusion transactions: ENABLED"
    );

    console.log(
        "✅ Two-watch acknowledgement: ENABLED"
    );

    console.log("");

    console.log("==========================================");
    console.log("");
});
