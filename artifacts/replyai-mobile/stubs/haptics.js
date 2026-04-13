"use strict";
const noop = async () => {};
exports.impactAsync = noop;
exports.notificationAsync = noop;
exports.selectionAsync = noop;
exports.ImpactFeedbackStyle = { Light: "light", Medium: "medium", Heavy: "heavy", Rigid: "rigid", Soft: "soft" };
exports.NotificationFeedbackType = { Success: "success", Warning: "warning", Error: "error" };
