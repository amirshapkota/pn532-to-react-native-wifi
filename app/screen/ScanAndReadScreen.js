import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function NFCScannerScreen() {
  const [uid, setUid] = useState(null);
  const ESP32_IP = 'http://192.168.1.76';

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${ESP32_IP}/uid`)
        .then((res) => res.json())
        .then((data) => {
          if (data.uid && data.uid !== uid) {
            setUid(data.uid);
            console.log("Scanned UID:", data.uid);
          }
        })
        .catch((err) => console.warn("Fetch failed:", err));
    }, 2000);

    return () => clearInterval(interval);
  }, [uid]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scanned NFC UID:</Text>
      <Text style={styles.uid}>{uid || 'Waiting for card...'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff',
  },
  title: {
    fontSize: 24, fontWeight: 'bold', marginBottom: 20,
  },
  uid: {
    fontSize: 20, color: '#333',
  },
});
