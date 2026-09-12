import { useThemeColors, useThemeStyles, type Palette } from '../utils/useTheme';
import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export const AuthModal: React.FC = () => {
  const Colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const {
    isAuthModalOpen,
    closeAuthModal,
    signIn,
    signUp,
    resetPassword,
    isLoading,
    errorMessage,
    clearError,
  } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [isFullScreen, setIsFullScreen] = useState(false);
  const fullScreenRef = useRef(false);
  fullScreenRef.current = isFullScreen;
  const defaultHeight = SCREEN_HEIGHT * 0.82;
  const fullHeight = SCREEN_HEIGHT * 0.95;
  const heightAnim = useRef(new Animated.Value(defaultHeight)).current;

  useEffect(() => {
    if (isAuthModalOpen) {
      setIsFullScreen(false);
      heightAnim.setValue(defaultHeight);
    }
  }, [isAuthModalOpen]);

  const toggleFullScreen = (toFull: boolean) => {
    setIsFullScreen(toFull);
    Animated.spring(heightAnim, {
      toValue: toFull ? fullHeight : defaultHeight,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
      onPanResponderRelease: (_, gestureState) => {
        // Explicit swipe UP -> expand
        if (gestureState.dy < -30) {
          toggleFullScreen(true);
        } else if (gestureState.dy > 60) {
          // Explicit swipe DOWN
          if (fullScreenRef.current) {
            toggleFullScreen(false);
          } else {
            closeAuthModal();
          }
        }
      },
    })
  ).current;

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      return;
    }

    if (mode === 'login') {
      await signIn(email, password);
    } else {
      await signUp(email, password, name);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('E-posta Gerekli', 'Lütfen önce e-posta adresinizi giriniz.');
      return;
    }
    const success = await resetPassword(email);
    if (success) {
      Alert.alert('Başarılı', 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.');
    }
  };

  return (
    <Modal
      visible={isAuthModalOpen}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={closeAuthModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeAuthModal}
        />

        <Animated.View style={[styles.sheet, { height: heightAnim }]}>
          {/* Top Bar with PanResponder */}
          <View {...panResponder.panHandlers} style={styles.topBar}>
            {/* Drag Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  {mode === 'login' ? 'Tekrar Hoş Geldiniz' : 'Voxen Hesabı Oluştur'}
                </Text>
                <Text style={styles.subTitle}>
                  {mode === 'login'
                    ? 'Müziklerinizi ve çalma listelerinizi eşitleyin'
                    : 'Sınırsız müzik deneyimi için hemen katılın'}
                </Text>
              </View>
            </View>
          </View>

          {/* Mode Switcher */}
          <View style={styles.switcher}>
            <TouchableOpacity
              style={[styles.switcherBtn, mode === 'login' && styles.switcherBtnActive]}
              onPress={() => {
                clearError();
                setMode('login');
              }}
            >
              <Text style={[styles.switcherText, mode === 'login' && styles.switcherTextActive]}>
                Giriş Yap
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.switcherBtn, mode === 'register' && styles.switcherBtnActive]}
              onPress={() => {
                clearError();
                setMode('register');
              }}
            >
              <Text style={[styles.switcherText, mode === 'register' && styles.switcherTextActive]}>
                Kayıt Ol
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color="#FF4D4D" />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Name input (only register) */}
            {mode === 'register' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Ad Soyad</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
                  <TextInput
                    style={styles.input}
                    placeholder="Adınız"
                    placeholderTextColor="#666"
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>
            )}

            {/* Email input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-posta</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="ornek@email.com"
                  placeholderTextColor="#666"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Password input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Şifre</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#666"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </View>

            {/* Forgot Password */}
            {mode === 'login' && (
              <TouchableOpacity
                style={styles.forgotBtn}
                onPress={handleForgotPassword}
              >
                <Text style={styles.forgotText}>Şifremi Unuttum</Text>
              </TouchableOpacity>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (Colors: Palette) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: '#161618',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    overflow: 'hidden',
  },
  topBar: {
    paddingTop: 12,
    width: '100%',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  subTitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  switcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 3,
    marginBottom: 16,
  },
  switcherBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  switcherBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  switcherText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  switcherTextActive: {
    color: '#FFFFFF',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 77, 77, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 77, 0.3)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#FF4D4D',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 18,
  },
  forgotText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  submitBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

