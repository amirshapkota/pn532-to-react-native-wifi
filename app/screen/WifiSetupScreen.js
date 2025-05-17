import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';

export default function WifiSetupScreen() {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
    <View style={styles.container}>
      <Text style={styles.title}>Setup Wi-Fi for ESP32</Text>
      <TextInput
        style={styles.input}
        placeholder="Wi-Fi SSID"
        value={ssid}
        onChangeText={setSsid}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Wi-Fi Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title={loading ? 'Sending...' : 'Send Credentials'} onPress={submitCredentials} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 22, marginBottom: 20, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 10, marginBottom: 15, borderRadius: 5 },
});