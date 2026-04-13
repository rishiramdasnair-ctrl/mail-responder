"use strict";
// Web stub for expo-secure-store — uses localStorage as fallback
const getItemAsync = async (key) => {
  try { return localStorage.getItem(key) ?? null; } catch { return null; }
};
const setItemAsync = async (key, value) => {
  try { localStorage.setItem(key, value); } catch {}
};
const deleteItemAsync = async (key) => {
  try { localStorage.removeItem(key); } catch {}
};
const getItem = (key) => {
  try { return localStorage.getItem(key) ?? null; } catch { return null; }
};
const setItem = (key, value) => {
  try { localStorage.setItem(key, value); } catch {}
};
const deleteItem = (key) => {
  try { localStorage.removeItem(key); } catch {}
};

exports.getItemAsync = getItemAsync;
exports.setItemAsync = setItemAsync;
exports.deleteItemAsync = deleteItemAsync;
exports.getItem = getItem;
exports.setItem = setItem;
exports.deleteItem = deleteItem;
exports.AFTER_FIRST_UNLOCK = "AFTER_FIRST_UNLOCK";
exports.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY";
exports.ALWAYS = "ALWAYS";
exports.ALWAYS_THIS_DEVICE_ONLY = "ALWAYS_THIS_DEVICE_ONLY";
exports.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY = "WHEN_PASSCODE_SET_THIS_DEVICE_ONLY";
exports.WHEN_UNLOCKED = "WHEN_UNLOCKED";
exports.WHEN_UNLOCKED_THIS_DEVICE_ONLY = "WHEN_UNLOCKED_THIS_DEVICE_ONLY";
