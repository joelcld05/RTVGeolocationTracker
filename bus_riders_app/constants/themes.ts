import { Platform } from 'react-native';

export const fontFamilies = {
  brand:
    Platform.select({
      ios: 'AvenirNext-DemiBold',
      android: 'sans-serif-medium',
      web: "'Avenir Next', 'Gill Sans', 'Trebuchet MS', sans-serif",
      default: 'System',
    }) ?? 'System',
  display:
    Platform.select({
      ios: 'AvenirNext-Heavy',
      android: 'sans-serif-condensed',
      web: "'Avenir Next', 'Gill Sans', 'Trebuchet MS', sans-serif",
      default: 'System',
    }) ?? 'System',
  body:
    Platform.select({
      ios: 'AvenirNext-Regular',
      android: 'sans-serif',
      web: "'Avenir Next', 'Gill Sans', 'Trebuchet MS', sans-serif",
      default: 'System',
    }) ?? 'System',
  eyebrow:
    Platform.select({
      ios: 'AvenirNext-Medium',
      android: 'sans-serif-medium',
      web: "'Avenir Next', 'Gill Sans', 'Trebuchet MS', sans-serif",
      default: 'System',
    }) ?? 'System',
};
