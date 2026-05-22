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
exports.generateSceneNavigation = generateSceneNavigation;
exports.stripSceneNavigation = stripSceneNavigation;
const path = __importStar(require("path"));
const NAV_START = '<!-- scene-navigation-start -->';
const NAV_END = '<!-- scene-navigation-end -->';
function generateSceneNavigation(memoDir, entries) {
    if (entries.length === 0)
        return '';
    const sorted = [...entries].sort((a, b) => b.heat - a.heat);
    const scenesDir = path.join(memoDir, 'scenes');
    const lines = [NAV_START, '', '## Scene Navigation', ''];
    for (const e of sorted) {
        const fullPath = path.join(scenesDir, e.filename).split(path.sep).join('/');
        lines.push(`### Path: ${fullPath}`);
        lines.push(`**Heat**: ${e.heat} 🔥 | **Updated**: ${e.updated}`);
        lines.push(`Summary: ${e.summary}`);
        lines.push('');
    }
    lines.push(NAV_END);
    return lines.join('\n');
}
function stripSceneNavigation(content) {
    const startIdx = content.indexOf(NAV_START);
    const endIdx = content.indexOf(NAV_END);
    if (startIdx === -1 || endIdx === -1)
        return content;
    return (content.slice(0, startIdx) + content.slice(endIdx + NAV_END.length)).trimEnd();
}
//# sourceMappingURL=scene-navigation.js.map