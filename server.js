//
//  server.js
//  BBBG Fusion Server
//
//  Prototype 1
//
//  Apple Watch A
//       ↓
//     HTTPS
//       ↓
//  BBBG Fusion Server
//       ↓
//     HTTPS
//       ↓
//  Apple Watch B
//
//  SERVER-AUTHORITATIVE FUSION
//
//  Rules:
//  1. Both Watches must perform a fist bump.
//  2. There is NO timing limit between the two bumps.
//  3. The server creates the fusion only after both bumps.
//  4. Every fusion gets a NEW fusionID.
//  5. Every fusion gets a NEW eventID.
//  6. The same fusion transaction is delivered to BOTH Watches.
//  7. Each Watch validates the fusion locally.
//  8. Each Watch sends an ACK.
//  9. The server clears the fusion only after BOTH Watches ACK.
// 10. The same two Watches can perform Fusion #2, #3, #4...
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
//
//         watchID: {
//
//             watchID,
//             app,
//             element,
//             tier,
//             lastSeen,
//
//             bump: {
//
//                 eventID,
//                 element,
//                 tier,
//                 createdAt
//             }
//         }
//     },
//
//     fusion: {
//
//         fusionID,
//         eventID,
//         type,
//         result,
//         createdAt,
//         sourceWatchID,
//         targetWatchID,
//         event,
//         acknowledgedBy: {}
//     }
//
//     OR
//
//     fusion: null
// }


// ============================================================
// MARK: - HELPERS
// ============================================================

function now() {
    return Date.now();
}


// ------------------------------------------------------------
// Normalize element
// ------------------------------------------------------------

function normalizeElement(element) {

    if (!element) {
        return null;
    }

    return String(element)
        .trim()
        .toLowerCase();
}


// ------------------------------------------------------------
// Get room
// ------------------------------------------------------------

function getRoom(roomCode) {

    return rooms.get(roomCode);
}


// ------------------------------------------------------------
// Create room if necessary
// ------------------------------------------------------------

function getOrCreateRoom(roomCode) {

    let room = rooms.get(roomCode);

    if (!room) {

        room = {

            watches: {},

            fusion: null
        };

        rooms.set(
            roomCode,
            room
        );
    }

    return room;
}


// ------------------------------------------------------------
// Room code compatibility
//
// Supports:
//     roomCode
//     room
// ------------------------------------------------------------

function getRoomCode(body) {

    if (!body) {
        return null;
    }

    return body.roomCode ||
           body.room ||
           null;
}


// ------------------------------------------------------------
// Generate unique ID
// ------------------------------------------------------------

function now() {
    return Date.now();
}

function makeID(prefix) {
    return `${prefix}-${now()}-${Math.random().toString(36).slice(2, 10)}`;
}


// ============================================================
// MARK: - SIX FUSIONS
// ============================================================
//
// IMPORTANT:
//
// Element names must match the Swift Element.rawValue values.
//
// ff = FrostFire
// g  = Glacier
// gt = Gentar
// s  = Supra
// sr = Sori
// sp = Sopan
//

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

function calculateFusion(
    firstElement,
    secondElement
) {

    const first =
        normalizeElement(
            firstElement
        );

    const second =
        normalizeElement(
            secondElement
        );

    if (!first || !second) {
        return null;
    }

    const sorted = [
        first,
        second
    ].sort();

    const key =
        `${sorted[0]}|${sorted[1]}`;

    return (
        FUSION_TABLE[key] ||
        null
    );
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

        type:
            "FUSION",

        fusionID,

        eventID,

        sourceWatchID,

        targetWatchID,

        sourceElement:
            normalizeElement(
                sourceElement
            ),

        targetElement:
            normalizeElement(
                targetElement
            ),

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

    return res.json({

        server:
            "BBBG Fusion Server",

        status:
            "online",

        prototype:
            "Prototype 1",

        fusionMode:
            "SERVER_AUTHORITATIVE",

        supportedFusions: [

            "ff",
            "g",
            "gt",
            "s",
            "sr",
            "sp"

        ],

        noTimingLimit:
            true,

        twoWatchSync:
            true,

        repeatedFusion:
            true,

        timestamp:
            now()
    });
});


// ============================================================
// MARK: - REGISTER WATCH
// ============================================================

app.post(
    "/room/register",
    (req, res) => {

        const roomCode =
            getRoomCode(
                req.body
            );

        const {

            watchID,

            app: appName,

            element,

            tier

        } = req.body;


        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        if (!roomCode || !watchID) {

            return res.status(400).json({

                error:
                    "room/roomCode and watchID are required"
            });
        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        const room =
            getOrCreateRoom(
                roomCode
            );


        // ----------------------------------------------------
        // Existing Watch
        // ----------------------------------------------------

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
                    normalizeElement(
                        element
                    );
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
                    Object.keys(
                        room.watches
                    ).length
            });
        }


        // ----------------------------------------------------
        // Maximum two Watches
        // ----------------------------------------------------

        const watchCount =
            Object.keys(
                room.watches
            ).length;

        if (watchCount >= 2) {

            return res.status(409).json({

                error:
                    "Room already has two Watches",

                roomCode,

                watchCount
            });
        }


        // ----------------------------------------------------
        // Register
        // ----------------------------------------------------

        room.watches[watchID] = {

            watchID,

            app:
                appName ||
                "BBBG",

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
                Object.keys(
                    room.watches
                ).length
        });
    }
);


// ============================================================
// MARK: - UPDATE WATCH STATE
// ============================================================

app.post(
    "/room/state",
    (req, res) => {

        const roomCode =
            getRoomCode(
                req.body
            );

        const {

            watchID,

            element,

            tier,

            app: appName

        } = req.body;


        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        if (!roomCode || !watchID) {

            return res.status(400).json({

                error:
                    "room/roomCode and watchID are required"
            });
        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        const room =
            getRoom(
                roomCode
            );

        if (!room) {

            return res.status(404).json({

                error:
                    "Room not found"
            });
        }


        // ----------------------------------------------------
        // Watch
        // ----------------------------------------------------

        const watch =
            room.watches[watchID];

        if (!watch) {

            return res.status(404).json({

                error:
                    "Watch not registered"
            });
        }


        // ----------------------------------------------------
        // Update
        // ----------------------------------------------------

        if (element !== undefined) {

            watch.element =
                normalizeElement(
                    element
                );
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
    }
);


// ============================================================
// MARK: - FIST BUMP
// ============================================================
//
// IMPORTANT:
//
// There is NO timing limit.
//
// Watch A can bump now.
//
// Watch B can bump much later.
//
// Fusion happens only when BOTH bumps exist.
//
// AFTER a fusion has been created:
//
//     room.fusion !== null
//
// No new bump is accepted until BOTH Watches have ACKed
// the active fusion.
//
// This prevents Fusion #2 from interfering with Fusion #1.
//


app.post(
    "/room/bump",
    (req, res) => {

        const roomCode =
            getRoomCode(
                req.body
            );

        const {

            watchID,

            eventID,

            element,

            tier

        } = req.body;


        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        if (!roomCode || !watchID) {

            return res.status(400).json({

                error:
                    "room/roomCode and watchID are required"
            });
        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        const room =
            getRoom(
                roomCode
            );

        if (!room) {

            return res.status(404).json({

                error:
                    "Room not found"
            });
        }


        // ====================================================
        // IMPORTANT SERVER PROTECTION
        // ====================================================
        //
        // A previous fusion must be completed by BOTH Watches
        // before another fusion can begin.
        //
        // This is the important correction.
        //

        if (room.fusion) {

            return res.status(409).json({

                error:
                    "Fusion still active",

                fusionID:
                    room.fusion.fusionID,

                eventID:
                    room.fusion.eventID,

                result:
                    room.fusion.result,

                acknowledgedBy:
                    Object.keys(
                        room.fusion.acknowledgedBy
                    )
            });
        }


        // ----------------------------------------------------
        // Source Watch
        // ----------------------------------------------------

        const sourceWatch =
            room.watches[watchID];

        if (!sourceWatch) {

            return res.status(404).json({

                error:
                    "Watch not registered"
            });
        }


        // ----------------------------------------------------
        // Other Watch
        // ----------------------------------------------------

        const otherWatchID =
            Object.keys(
                room.watches
            ).find(
                id =>
                    id !== watchID
            );

        if (!otherWatchID) {

            return res.status(409).json({

                error:
                    "Waiting for second Watch"
            });
        }

        const otherWatch =
            room.watches[
                otherWatchID
            ];


        // ----------------------------------------------------
        // Update source state
        // ----------------------------------------------------

        if (element !== undefined) {

            sourceWatch.element =
                normalizeElement(
                    element
                );
        }

        if (tier !== undefined) {

            sourceWatch.tier =
                Number(tier);
        }

        sourceWatch.lastSeen =
            now();


        // ----------------------------------------------------
        // Tier validation
        // ----------------------------------------------------

        if (
            sourceWatch.tier < 2
        ) {

            return res.status(400).json({

                error:
                    "Fusion requires Tier 2 elements",

                tier:
                    sourceWatch.tier
            });
        }


        if (
            otherWatch.tier < 2
        ) {

            return res.status(400).json({

                error:
                    "Other Watch is not using Tier 2",

                otherTier:
                    otherWatch.tier
            });
        }


        // ----------------------------------------------------
        // Element validation
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // Record THIS Watch's bump
        // ----------------------------------------------------

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
        console.log(
            "Bump ID:",
            bumpID
        );
        console.log("");


        // ----------------------------------------------------
        // Wait for other Watch
        // ----------------------------------------------------

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


        // ====================================================
        // BOTH WATCHES HAVE BUMPED
        // ====================================================

        console.log("");
        console.log(
            "🤜🤛 BOTH WATCHES BUMPED"
        );
        console.log(
            "Watch A:",
            sourceWatch.watchID
        );
        console.log(
            "Watch B:",
            otherWatch.watchID
        );
        console.log("");


        // ----------------------------------------------------
        // Calculate fusion
        // ----------------------------------------------------

        const result =
            calculateFusion(

                sourceWatch.bump.element,

                otherWatch.bump.element
            );


        // ----------------------------------------------------
        // Invalid combination
        // ----------------------------------------------------

        if (!result) {

            console.log("");
            console.log(
                "❌ NO FUSION"
            );
            console.log(
                sourceWatch.bump.element,
                "+",
                otherWatch.bump.element
            );
            console.log("");


            // Clear both bumps.

            sourceWatch.bump =
                null;

            otherWatch.bump =
                null;


            return res.status(400).json({

                error:
                    "Invalid fusion combination",

                firstElement:
                    sourceWatch.element,

                secondElement:
                    otherWatch.element
            });
        }


        // ----------------------------------------------------
        // Create NEW fusion transaction
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // Store fusion transaction
        // ----------------------------------------------------

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

            acknowledgedBy:
                {}
        };


        // ----------------------------------------------------
        // Clear bumps
        // ----------------------------------------------------
        //
        // The bumps have now been converted into a fusion.
        //
        // The active fusion remains in room.fusion until BOTH
        // Watches acknowledge it.
        //

        sourceWatch.bump =
            null;

        otherWatch.bump =
            null;


        // ----------------------------------------------------
        // Log
        // ----------------------------------------------------

        console.log("");
        console.log(
            "=========================================="
        );
        console.log(
            "🔥 FUSION CREATED"
        );
        console.log(
            "=========================================="
        );

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

        console.log(
            "=========================================="
        );

        console.log("");


        // ----------------------------------------------------
        // Response
        // ----------------------------------------------------

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
    }
);


// ============================================================
// MARK: - FUSION ACKNOWLEDGEMENT
// ============================================================
//
// Each Watch calls:
//
// POST /room/event
//
// The server keeps the fusion active until BOTH Watches ACK.
//

app.post(
    "/room/event",
    (req, res) => {

        const roomCode =
            getRoomCode(
                req.body
            );

        const {

            watchID,

            eventID,

            fusionID,

            type,

            result

        } = req.body;


        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        if (!roomCode || !watchID) {

            return res.status(400).json({

                error:
                    "room/roomCode and watchID are required"
            });
        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        const room =
            getRoom(
                roomCode
            );

        if (!room) {

            return res.status(404).json({

                error:
                    "Room not found"
            });
        }


        // ----------------------------------------------------
        // Watch
        // ----------------------------------------------------

        const watch =
            room.watches[watchID];

        if (!watch) {

            return res.status(404).json({

                error:
                    "Watch not registered"
            });
        }


        // ----------------------------------------------------
        // Event type
        // ----------------------------------------------------

        if (
            type !==
            "FUSION_RESULT"
        ) {

            return res.status(400).json({

                error:
                    "Unsupported event type"
            });
        }


        // ----------------------------------------------------
        // Active fusion
        // ----------------------------------------------------

        const fusion =
            room.fusion;

        if (!fusion) {

            return res.status(404).json({

                error:
                    "No active fusion"
            });
        }


        // ----------------------------------------------------
        // Verify Watch belongs to fusion
        // ----------------------------------------------------

        if (
            fusion.sourceWatchID !== watchID &&
            fusion.targetWatchID !== watchID
        ) {

            return res.status(403).json({

                error:
                    "Watch is not part of this fusion"
            });
        }


        // ----------------------------------------------------
        // Verify fusion ID
        // ----------------------------------------------------

        if (
            !fusionID ||
            fusion.fusionID !== fusionID
        ) {

            return res.status(409).json({

                error:
                    "Fusion ID does not match active fusion",

                activeFusionID:
                    fusion.fusionID,

                receivedFusionID:
                    fusionID || null
            });
        }


        // ----------------------------------------------------
        // Verify event ID
        // ----------------------------------------------------

        if (
            !eventID ||
            fusion.eventID !== eventID
        ) {

            return res.status(409).json({

                error:
                    "Event ID does not match active fusion",

                activeEventID:
                    fusion.eventID,

                receivedEventID:
                    eventID || null
            });
        }


        // ----------------------------------------------------
        // Verify result
        // ----------------------------------------------------

        const validResults = [

            "ff",
            "g",
            "gt",
            "s",
            "sr",
            "sp"

        ];


        if (
            !validResults.includes(
                result
            )
        ) {

            return res.status(400).json({

                error:
                    "Invalid fusion result",

                result
            });
        }


        // ----------------------------------------------------
        // Verify result matches active fusion
        // ----------------------------------------------------

        if (
            result !==
            fusion.result
        ) {

            return res.status(409).json({

                error:
                    "Fusion result does not match active fusion",

                activeResult:
                    fusion.result,

                receivedResult:
                    result
            });
        }


        // ----------------------------------------------------
        // ACK
        // ----------------------------------------------------

        fusion.acknowledgedBy[
            watchID
        ] = now();


        console.log("");
        console.log(
            "✅ FUSION ACK"
        );

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


        // ----------------------------------------------------
        // Count acknowledgements
        // ----------------------------------------------------

        const registeredWatchIDs =
            Object.keys(
                room.watches
            );

        const acknowledgedWatchIDs =
            Object.keys(
                fusion.acknowledgedBy
            );


        const allAcknowledged =

            registeredWatchIDs.length >= 2 &&

            registeredWatchIDs.every(
                id =>
                    acknowledgedWatchIDs.includes(
                        id
                    )
            );


        // ----------------------------------------------------
        // Both Watches finished
        // ----------------------------------------------------

        if (allAcknowledged) {

            console.log("");
            console.log(
                "=========================================="
            );
            console.log(
                "✅ BOTH WATCHES ACKNOWLEDGED FUSION"
            );
            console.log(
                "=========================================="
            );

            console.log(
                "Fusion:",
                fusion.fusionID
            );

            console.log(
                "Result:",
                fusion.result
            );

            console.log(
                "=========================================="
            );

            console.log("");


            // Clear ONLY after both ACK.

            room.fusion =
                null;


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


        // ----------------------------------------------------
        // Still waiting
        // ----------------------------------------------------

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
                Object.keys(
                    fusion.acknowledgedBy
                )
        });
    }
);


// ============================================================
// MARK: - POLL
// ============================================================
//
// Both Watches continuously poll:
//
// GET /room/poll
//
// The same active fusion is returned to BOTH Watches.
//
// The server DOES NOT delete the fusion because of time.
//
// It remains until both Watches ACK.
//

app.get(
    "/room/poll",
    (req, res) => {

        const roomCode =
            req.query.roomCode ||
            req.query.room;

        const watchID =
            req.query.watchID;


        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        if (!roomCode || !watchID) {

            return res.status(400).json({

                error:
                    "room/roomCode and watchID are required"
            });
        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        const room =
            getRoom(
                roomCode
            );

        if (!room) {

            return res.status(404).json({

                error:
                    "Room not found"
            });
        }


        // ----------------------------------------------------
        // Watch
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // Other Watch
        // ----------------------------------------------------

        const otherWatchID =
            Object.keys(
                room.watches
            ).find(
                id =>
                    id !== watchID
            );


        const otherWatch =
            otherWatchID
            ? room.watches[
                otherWatchID
            ]
            : null;


        // ----------------------------------------------------
        // Active fusion
        // ----------------------------------------------------

        const fusion =
            room.fusion;


        // ----------------------------------------------------
        // Response
        // ----------------------------------------------------

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
    }
);


// ============================================================
// MARK: - RESET ROOM
// ============================================================
//
// POST /room/reset
//
// Useful during testing if a Watch crashes or the developer
// wants to manually clear an unfinished fusion.
//

app.post(
    "/room/reset",
    (req, res) => {

        const roomCode =
            getRoomCode(
                req.body
            );


        // ----------------------------------------------------
        // Validate
        // ----------------------------------------------------

        if (!roomCode) {

            return res.status(400).json({

                error:
                    "room/roomCode is required"
            });
        }


        // ----------------------------------------------------
        // Room
        // ----------------------------------------------------

        const room =
            getRoom(
                roomCode
            );

        if (!room) {

            return res.status(404).json({

                error:
                    "Room not found"
            });
        }


        // ----------------------------------------------------
        // Clear fusion
        // ----------------------------------------------------

        room.fusion =
            null;


        // ----------------------------------------------------
        // Reset watches
        // ----------------------------------------------------

        Object.values(
            room.watches
        ).forEach(
            watch => {

                watch.element =
                    null;

                watch.tier =
                    1;

                watch.bump =
                    null;

                watch.lastSeen =
                    now();
            }
        );


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
    }
);


// ============================================================
// MARK: - DEBUG ROOM
// ============================================================
//
// GET /room/:roomCode
//
// Useful for checking Render/server state.
//

app.get(
    "/room/:roomCode",
    (req, res) => {

        const roomCode =
            req.params.roomCode;

        const room =
            getRoom(
                roomCode
            );


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
    }
);


// ============================================================
// MARK: - START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "=========================================="
        );

        console.log(
            "          BBBG FUSION SERVER"
        );

        console.log(
            "=========================================="
        );

        console.log("");

        console.log(
            `🚀 Server running on port ${PORT}`
        );

        console.log("");

        console.log(
            "Server architecture:"
        );

        console.log(
            "🤜🤛 Both Watches must bump"
        );

        console.log(
            "⏳ No timing limit between bumps"
        );

        console.log(
            "🔥 Server creates fusion transaction"
        );

        console.log(
            "📡 Same fusion sent to both Watches"
        );

        console.log(
            "✅ Both Watches must ACK"
        );

        console.log(
            "🔁 Repeated fusions enabled"
        );

        console.log("");

        console.log(
            "Supported fusions:"
        );

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

        console.log(
            "🛡️ Active-fusion bump protection: ENABLED"
        );

        console.log("");

        console.log(
            "=========================================="
        );

        console.log("");
    }
);
