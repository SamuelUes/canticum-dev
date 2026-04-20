"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = exports.users = exports.artists = exports.schemas = exports.search = exports.songs = exports.webSubscriptions = exports.webPremium = exports.webFavorites = exports.webEditorial = exports.webSchemas = exports.webSongs = void 0;
exports.webSongs = __importStar(require("./songs"));
exports.webSchemas = __importStar(require("./schemas"));
exports.webEditorial = __importStar(require("./editorial"));
exports.webFavorites = __importStar(require("./favorites"));
exports.webPremium = __importStar(require("./premium"));
exports.webSubscriptions = __importStar(require("./subscriptions"));
var songs_1 = require("./songs");
Object.defineProperty(exports, "songs", { enumerable: true, get: function () { return songs_1.songs; } });
var search_1 = require("./search");
Object.defineProperty(exports, "search", { enumerable: true, get: function () { return search_1.search; } });
var schemas_1 = require("./schemas");
Object.defineProperty(exports, "schemas", { enumerable: true, get: function () { return schemas_1.schemas; } });
var artists_1 = require("./artists");
Object.defineProperty(exports, "artists", { enumerable: true, get: function () { return artists_1.artists; } });
var users_1 = require("./users");
Object.defineProperty(exports, "users", { enumerable: true, get: function () { return users_1.users; } });
var auth_1 = require("./auth");
Object.defineProperty(exports, "auth", { enumerable: true, get: function () { return auth_1.auth; } });
//# sourceMappingURL=index.js.map