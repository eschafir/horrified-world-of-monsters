// ---------------------------------------------------------
// GAME CLIENT STATE VARIABLES
// ---------------------------------------------------------

let socket = null;
let playerName = "";
let roomCode = "";
let gameState = null;
let selectedAction = null;
let lastDrawnCardId = null;
let isCardFlying = false;
let hasDrawnThisPhase = false;
let lastCharacterPositions = {};
let pendingCardData = null;
let selectedItemsForAction = []; // Track item selections for trades/scaffold
let destinationNodeSelection = null; // Track movement target
let guideSelectedLegend = null; // { name, loc, type } — the citizen/Yeti child chosen as the Guide source, on-map, step 2 of 2
let mapLocationPickerTargets = null; // array of location names highlighted as clickable, while selectedAction === "map_location_picker"
let mapLocationPickerCallback = null; // (locName) => void, fired when a highlighted node is clicked
let mapEntityPickerType = null; // "hero" | "monster" - which token type is glowing/clickable on the map
let mapEntityPickerNames = null; // array of eligible hero/monster names
let mapEntityPickerCallback = null; // (name) => void, single-select; (names[]) => void, multi-select
let mapEntityPickerMultiSelect = false;
let mapEntityPickerSelected = null; // Set of currently-toggled names, only used when multi-select
let chosenHero = "The Guardian";
let dragType = null;
let dragLocName = null;
let lastGamePhaseSeen = null;
let lastPendingDiceRollId = "";
let lastBlockChoiceId = ""; // pending_block_choice.id already shown, so the modal isn't re-triggered every broadcast
let lastTurnPlayerIdx = null; // clears the permanent dice display only when the turn actually changes
let intentionalDisconnect = false;
let lastTerrorLevel = null;
let pendingTerrorTransitionFrom = null; // consumed once by renderSVGMap to slide the neon ring from its old slot
let knownDefeatedMonsters = null; // Set of monster names already seen in defeated_monsters, to trigger a defeat sound only once
let knownPowerEventIds = null; // Set of power_event ids already shown as a toast, to fire each one only once
let knownCitizenEventIds = null; // Set of citizen_event ids already shown as a toast, to fire each one only once
let knownCitizenAttackEventIds = null; // Set of citizen_attack_event ids already shown as an on-map marker, to fire each one only once

// Map Zoom & Pan State
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
const baseWidth = 1304;
const baseHeight = 1206;

// Side Panel Carousel Indices
let currentHeroTabIndex = 0;
let currentMonsterTabIndex = 0;

const HEROES_LIST = ["The Guardian", "The Investigator", "The Buccaneer", "The Fortune Teller", "The Parapsychologist", "Actor", "Hoplite", "Mariner", "Musician", "Ranger", "Shepherd", "Traveler"];

// ---------------------------------------------------------
// ELEMENT SELECTORS
// ---------------------------------------------------------

const elLobbyScreen = document.getElementById("lobby-screen");
const elGameScreen = document.getElementById("game-screen");
const elSetupView = document.getElementById("setup-view");
const elWaitingView = document.getElementById("waiting-view");
const elPlayerNameInput = document.getElementById("player-name");
const elRoomCodeInput = document.getElementById("room-code");
const elDisplayRoomCode = document.getElementById("display-room-code");
const elHeroOptions = document.getElementById("hero-options");
const elConnectedPlayers = document.getElementById("connected-players");
const elHostSettings = document.getElementById("host-settings");
const elHostStartWrap = document.getElementById("host-start-wrap");
const elBtnCreate = document.getElementById("btn-create");
const elBtnJoin = document.getElementById("btn-join");
const elBtnStart = document.getElementById("btn-start");

const elGameMap = document.getElementById("game-map");
const elLogBox = document.getElementById("game-log-box");
const elChatBox = document.getElementById("chat-box");
const elChatInput = document.getElementById("chat-input");
const elBtnChatSend = document.getElementById("btn-chat-send");
const elModalContainer = document.getElementById("modal-container");
const elModalBody = document.getElementById("modal-body");
const elCloseModal = document.querySelector(".close-modal");
const elBtnMainMenu = document.getElementById("btn-main-menu");
const elGameOverOverlay = document.getElementById("game-over-overlay");

