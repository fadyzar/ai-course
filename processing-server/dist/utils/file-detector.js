"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFileCategory = detectFileCategory;
exports.isVideoFile = isVideoFile;
exports.isPptxFile = isPptxFile;
exports.isPdfFile = isPdfFile;
exports.isDocxFile = isDocxFile;
const VIDEO_TYPES = new Set(['mp4', 'mpeg', 'mov', 'avi', 'webm', 'mkv', 'm4v']);
const DOCUMENT_TYPES = new Set(['pptx', 'ppt', 'pdf', 'docx', 'doc', 'xlsx', 'xls']);
function detectFileCategory(fileType) {
    const ext = fileType.toLowerCase().replace(/^\./, '');
    if (ext === 'pptx' || ext === 'ppt')
        return 'pptx';
    if (ext === 'pdf')
        return 'pdf';
    if (ext === 'docx' || ext === 'doc')
        return 'docx';
    if (VIDEO_TYPES.has(ext))
        return 'video';
    return 'unknown';
}
function isVideoFile(fileType) {
    return detectFileCategory(fileType) === 'video';
}
function isPptxFile(fileType) {
    return detectFileCategory(fileType) === 'pptx';
}
function isPdfFile(fileType) {
    return detectFileCategory(fileType) === 'pdf';
}
function isDocxFile(fileType) {
    return detectFileCategory(fileType) === 'docx';
}
