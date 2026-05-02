/**
 * camera-safe.ts — Web/Tauri version
 * 
 * This file is loaded instead of expo-camera on web builds.
 * expo-camera's module initialization accesses navigator.mediaDevices
 * which throws "The operation is insecure" in Tauri's webview.
 * The Scan tab uses file-picker/drag-drop on web — camera is never needed.
 */
import { useState } from 'react';
import { View } from 'react-native';

export function useCameraPermissions(): [{ granted: boolean }, () => void] {
  const [state] = useState({ granted: true });
  return [state, () => {}];
}

// Dummy CameraView that renders nothing (never shown on web)
export const CameraView = View;
