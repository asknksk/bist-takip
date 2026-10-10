import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';

interface KeyboardAvoidingContainerProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function KeyboardAvoidingContainer({
  children,
  style,
}: KeyboardAvoidingContainerProps) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
