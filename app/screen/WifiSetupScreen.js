import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Assuming you're using Expo or have this library

export default function WifiSetupScreen() {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const handleGoBack = () => {
    // Add your navigation logic here
    console.log('Go back pressed');
  };
  
  const submitCredentials = async () => {
    if (!ssid || !password) {
      Alert.alert('Error', 'Please enter both SSID and password');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('http://192.168.4.1/wifi-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password }),
      });
      if (response.ok) {
        Alert.alert('Success', 'Credentials sent! ESP32 is connecting...');
      } else {
        Alert.alert('Error', 'Failed to send credentials');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to ESP32 SoftAP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <View>
              <Text style={styles.brandName}>TAPYZE</Text>
              <Text style={styles.merchantLabel}>MERCHANT</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Ionicons name="chevron-back" size={28} color="#000000" />
          </TouchableOpacity>
        </View>
        
        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.screenTitle}>Wi-Fi Setup</Text>
          <Text style={styles.screenSubtitle}>Enter your network credentials to connect ESP32</Text>
        </View>
        
        {/* Security Icon */}
        <View style={styles.securityIconContainer}>
          <View style={styles.securityIconCircle}>
            <Ionicons name="wifi" size={40} color="#FFFFFF" />
          </View>
        </View>
        
        {/* Form Section */}
        <View style={styles.formSection}>
          {/* SSID Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Wi-Fi Network (SSID)</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="wifi-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Enter network name"
                value={ssid}
                onChangeText={setSsid}
                autoCapitalize="none"
              />
            </View>
          </View>
          
          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Wi-Fi Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="Enter network password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>Enter your Wi-Fi password</Text>
          </View>
        </View>
        
        {/* Submit Button */}
        <TouchableOpacity 
          style={[styles.updateButton, (!ssid || !password || loading) && styles.updateButtonDisabled]}
          onPress={submitCredentials}
          disabled={!ssid || !password || loading}
        >
          <Text style={styles.updateButtonText}>{loading ? 'Connecting...' : 'Connect Device'}</Text>
        </TouchableOpacity>
        
        {/* Help Link */}
        <View style={styles.forgotPasswordContainer}>
          <TouchableOpacity>
            <Text style={styles.forgotPasswordText}>Need help connecting?</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },
  scrollViewContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    height: 45,
    width: 45,
  },
  brandName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    marginLeft: 8,
  },
  merchantLabel: {
    fontSize: 12,
    color: '#ed7b0e',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  backButton: {
    padding: 5,
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  screenTitle: {
    fontSize: 28,
    color: '#000000',
    fontWeight: 'bold',
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  securityIconContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  securityIconCircle: {
    width: 90,
    height: 90,
    backgroundColor: '#ed7b0e',
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ed7b0e',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 15,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    backgroundColor: '#F9F9F9',
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: '#333',
    fontSize: 16,
    height: 50,
  },
  eyeIcon: {
    padding: 5,
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    marginLeft: 2,
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 8,
    marginLeft: 2,
  },
  updateButton: {
    backgroundColor: '#ed7b0e',
    borderRadius: 12,
    paddingVertical: 16,
    marginHorizontal: 15,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ed7b0e',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  updateButtonDisabled: {
    backgroundColor: '#f5a55e',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  forgotPasswordText: {
    color: '#ed7b0e',
    fontSize: 14,
    fontWeight: '500',
  },
});