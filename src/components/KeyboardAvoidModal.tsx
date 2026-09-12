import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Keyboard,
  Platform,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardAvoidModalProps {
  visible: boolean;
  onRequestClose: () => void;
  onBackdropPress?: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  backdropStyle?: StyleProp<ViewStyle>;
  statusBarTranslucent?: boolean;
}

export const KeyboardAvoidModal: React.FC<KeyboardAvoidModalProps> = ({
  visible,
  onRequestClose,
  onBackdropPress,
  children,
  contentStyle,
  backdropStyle,
  statusBarTranslucent = true,
}) => {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={statusBarTranslucent}
      onRequestClose={onRequestClose}
    >
      <TouchableWithoutFeedback onPress={onBackdropPress || onRequestClose}>
        <View
          style={[
            styles.backdrop,
            backdropStyle,
            {
              paddingBottom: keyboardHeight > 0 ? keyboardHeight * 0.75 : 0,
              paddingTop: insets.top || 16,
            },
          ]}
        >
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={[styles.dialogCard, contentStyle]}>
              {children}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#161619',
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
});
