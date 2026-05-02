/**
 * camera-safe.native.ts — iOS/Android version
 * 
 * On native platforms, re-export the real expo-camera.
 * Metro loads .native.ts files on iOS/Android automatically.
 */
export { CameraView, useCameraPermissions } from 'expo-camera';
