import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
  FlatList,
  RefreshControl,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import NetInfo from "@react-native-community/netinfo";

export default function RfidScreen() {
  // WiFi setup states
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(true);

  // RFID scanner states
  const [rfidReaderIP, setRfidReaderIP] = useState('192.168.4.1'); // Default setup IP
  const [scannerConnected, setScannerConnected] = useState(false);
  const [searching, setSearching] = useState(false);
  const [lastScannedCard, setLastScannedCard] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [networkInfo, setNetworkInfo] = useState(null);
  
  // Animation for card detection
  const [cardAnimation] = useState(new Animated.Value(0));
  
  // Initialize and check network status
  useEffect(() => {
    checkNetworkStatus();
    
    // Set up network state change listener
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.type === 'wifi') {
        checkNetworkStatus();
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Function to check network status
  const checkNetworkStatus = async () => {
    try {
      const netState = await NetInfo.fetch();
      setNetworkInfo(netState);
      
      if (netState.isConnected && netState.type === 'wifi') {
        // Check if we're on the setup network
        if (netState.details && netState.details.ssid === 'TapyzeSetup') {
          setSetupMode(true);
          setRfidReaderIP('192.168.4.1');
          checkScannerStatus('192.168.4.1');
        } else {
          // We're on a regular WiFi network
          setSetupMode(false);
          
          // Check if we already know the scanner's IP
          if (rfidReaderIP && rfidReaderIP !== '192.168.4.1') {
            checkScannerStatus(rfidReaderIP);
          } else {
            // Otherwise try to find it
            findScannerOnNetwork();
          }
        }
      } else {
        Alert.alert(
          'Network Connection Required',
          'Please connect to a WiFi network to use this app.'
        );
      }
    } catch (error) {
      console.error('Network status check error:', error);
    }
  };
  
  // Find RFID Scanner on the network using common IP addresses
  const findScannerOnNetwork = async () => {
    setSearching(true);
    
    try {
      // Try mDNS hostname first
      try {
        console.log('Trying mDNS hostname (rfidreader.local)...');
        const mDNSResponse = await fetch('http://rfidreader.local/status', { 
          timeout: 3000 
        });
        
        if (mDNSResponse.ok) {
          const data = await mDNSResponse.json();
          console.log('Found ESP32 via mDNS:', data);
          setRfidReaderIP(data.ip);
          setScannerConnected(true);
          setSearching(false);
          
          // Start polling for RFID tags
          startRFIDPolling(data.ip);
          return;
        }
      } catch (error) {
        console.log('mDNS lookup failed, trying IP scan');
      }
      
      // If mDNS fails, try the common IP addresses directly
      const commonIPs = [
        '192.168.1.1', '192.168.1.100', '192.168.1.101', '192.168.1.150', '192.168.1.200',
        '192.168.0.1', '192.168.0.100', '192.168.0.101', '192.168.0.150', '192.168.0.200',
        '192.168.2.1', '192.168.2.100', '192.168.2.101', '192.168.2.150', '192.168.2.200',
        '10.0.0.1', '10.0.0.100', '10.0.0.101', '10.0.0.150', '10.0.0.200',
      ];
      
      // Try known common addresses
      console.log('Trying common IP addresses...');
      let found = false;
      
      for (const ip of commonIPs) {
        if (found) break;
        
        console.log('Trying IP:', ip);
        
        try {
          const response = await fetch(`http://${ip}/status`, { 
            timeout: 1000 
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Verify this is our ESP32 by checking response format
            if (data && 'isConnected' in data) {
              console.log('Found ESP32 at IP:', ip);
              setRfidReaderIP(ip);
              setScannerConnected(true);
              found = true;
              
              // Start polling for RFID tags
              startRFIDPolling(ip);
            }
          }
        } catch (error) {
          // Continue trying next IP
        }
      }
      
      // If still not found, try IP range scan (10 IPs at a time)
      if (!found) {
        console.log('Trying targeted IP range scan...');
        
        // If we know the device's IP, try to guess the subnet
        if (networkInfo?.details?.ipAddress) {
          const deviceIP = networkInfo.details.ipAddress;
          const ipParts = deviceIP.split('.');
          const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
          
          // Scan first 20 addresses in subnet
          for (let i = 1; i <= 20; i++) {
            if (found) break;
            
            const ipToTry = `${subnet}.${i}`;
            console.log('Scanning IP:', ipToTry);
            
            try {
              const response = await fetch(`http://${ipToTry}/status`, { 
                timeout: 800 
              });
              
              if (response.ok) {
                const data = await response.json();
                
                // Verify this is our ESP32
                if (data && 'isConnected' in data) {
                  console.log('Found ESP32 at IP:', ipToTry);
                  setRfidReaderIP(ipToTry);
                  setScannerConnected(true);
                  found = true;
                  
                  // Start polling for RFID tags
                  startRFIDPolling(ipToTry);
                }
              }
            } catch (error) {
              // Continue trying next IP
            }
          }
        }
      }
      
      if (!found) {
        Alert.alert(
          'Scanner Not Found',
          'Could not find the RFID scanner on your network. Make sure it is connected to the same WiFi network, or enter the IP address manually.',
          [
            {
              text: 'Enter IP Manually',
              onPress: () => showManualIPPrompt()
            },
            {
              text: 'OK',
              style: 'cancel'
            }
          ]
        );
      }
      
    } catch (error) {
      console.error('Error finding scanner:', error);
      Alert.alert(
        'Network Error',
        'Error scanning the network: ' + error.message
      );
    } finally {
      setSearching(false);
    }
  };
  
  // Prompt for manual IP entry
  const showManualIPPrompt = () => {
    Alert.prompt(
      'Enter Scanner IP',
      'Please enter the IP address of your RFID scanner:',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Connect',
          onPress: (ip) => {
            if (ip && ip.trim()) {
              setRfidReaderIP(ip.trim());
              checkScannerStatus(ip.trim());
            }
          }
        }
      ],
      'plain-text',
      '',
      'numeric'
    );
  };
  
  // Function to check if a specific IP is our scanner
  const checkScannerStatus = async (ip) => {
    try {
      console.log('Checking scanner status at IP:', ip);
      const response = await fetch(`http://${ip}/status`, { timeout: 3000 });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Scanner status response:', data);
        setScannerConnected(true);
        
        // If the scanner is in station mode and connected to WiFi
        if (data.isConnected) {
          setSetupMode(false);
          // Update the IP if it has changed (e.g., from AP mode to station mode)
          if (data.ip && data.ip !== ip && data.ip !== '0.0.0.0') {
            console.log('Updated scanner IP from', ip, 'to', data.ip);
            setRfidReaderIP(data.ip);
            startRFIDPolling(data.ip);
            return data.ip; // Return the updated IP
          } else {
            startRFIDPolling(ip);
          }
        } else {
          setSetupMode(true);
        }
        
        return ip; // Return the current IP if it's still valid
      }
    } catch (error) {
      console.error('Scanner status check error:', error);
      setScannerConnected(false);
    }
    return null;
  };
  
  // Start polling for RFID scans
  const startRFIDPolling = (ip) => {
    // Clear any existing interval
    if (window.rfidPollingInterval) {
      clearInterval(window.rfidPollingInterval);
    }
    
    console.log('Starting RFID polling at IP:', ip);
    
    // Set up a new polling interval
    window.rfidPollingInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://${ip}/read-rfid`);
        
        if (response.ok) {
          const data = await response.json();
          
          // If we have a UID and it's different from the last one we processed
          if (data.uid && data.uid.length > 0 && (!lastScannedCard || data.uid !== lastScannedCard.uid)) {
            console.log('New RFID card detected:', data.uid);
            
            // Create a card object with timestamp
            const newCard = {
              uid: data.uid,
              timestamp: new Date().toLocaleTimeString(),
              id: Math.random().toString(36).substring(2, 10), // Random ID for FlatList
            };
            
            // Update state
            setLastScannedCard(newCard);
            
            // Add to history (only keep last 20)
            setScanHistory(prevHistory => [
              newCard,
              ...prevHistory.slice(0, 19)
            ]);
            
            // Trigger animation and vibration
            Animated.sequence([
              Animated.timing(cardAnimation, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(cardAnimation, {
                toValue: 0,
                duration: 300,
                delay: 500,
                useNativeDriver: true,
              })
            ]).start();
            
            // Vibrate the device
            Vibration.vibrate(200);
          }
        }
      } catch (error) {
        console.error('RFID polling error:', error);
        
        // If we get an error, check if the scanner is still available
        const stillConnected = await checkScannerStatus(ip);
        
        if (!stillConnected) {
          // Stop polling if scanner is not available
          clearInterval(window.rfidPollingInterval);
          setScannerConnected(false);
        }
      }
    }, 1000); // Poll every second
  };
  
  // Function to send WiFi credentials to ESP32
  const sendWifiCredentials = async () => {
    if (!ssid || !password) {
      Alert.alert('Error', 'Please enter both SSID and password');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch(`http://${rfidReaderIP}/wifi-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password })
      });
      
      if (response.ok) {
        Alert.alert(
          'Success', 
          'WiFi credentials sent! The ESP32 is connecting to your network. Once connected, you can switch back to your regular WiFi.'
        );
        
        // Wait a bit then check status
        setTimeout(async () => {
          const newIP = await checkScannerStatus(rfidReaderIP);
          if (newIP) {
            startRFIDPolling(newIP);
          }
          setLoading(false);
        }, 10000);
      } else {
        Alert.alert('Error', 'Failed to send credentials to the scanner');
        setLoading(false);
      }
    } catch (error) {
      Alert.alert(
        'Connection Error',
        `Could not connect to the scanner at ${rfidReaderIP}. Make sure your phone is connected to the TapyzeSetup WiFi network.`
      );
      setLoading(false);
    }
  };
  
  // Handle manual refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await checkNetworkStatus();
    setRefreshing(false);
  };
  
  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (window.rfidPollingInterval) {
        clearInterval(window.rfidPollingInterval);
      }
    };
  }, []);

  // Animation style for card detection
  const cardHighlightStyle = {
    transform: [
      {
        scale: cardAnimation.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.05]
        })
      }
    ],
    shadowOpacity: cardAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [0.2, 0.8]
    }),
    backgroundColor: cardAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: ['#ffffff', '#f0f8ff']
    })
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#4a90e2']}
        />
      }
    >
      <Text style={styles.title}>RFID Reader</Text>
      
      {/* Network Status Banner */}
      <View style={styles.statusBanner}>
        <Text style={styles.statusText}>
          {setupMode 
            ? 'Setup Mode: Connect to WiFi'
            : scannerConnected 
              ? 'Connected to RFID Scanner'
              : 'Searching for RFID Scanner...'}
        </Text>
        {(searching || loading) && (
          <ActivityIndicator size="small" color="#ffffff" />
        )}
      </View>
      
      {/* Network Information */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Network Status</Text>
        <Text style={styles.infoText}>
          Connected to: {networkInfo?.details?.ssid || 'Unknown'}
        </Text>
        {rfidReaderIP && (
          <Text style={styles.infoText}>
            Scanner IP: {rfidReaderIP}
          </Text>
        )}
        <Text style={styles.infoText}>
          Mode: {setupMode ? 'Setup' : 'Normal Operation'}
        </Text>
      </View>
      
      {/* WiFi Setup Form - Only show in setup mode */}
      {setupMode && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>WiFi Setup</Text>
          <TextInput
            style={styles.input}
            placeholder="WiFi SSID"
            value={ssid}
            onChangeText={setSsid}
            autoCapitalize="none"
            editable={!loading}
          />
          <TextInput
            style={styles.input}
            placeholder="WiFi Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={sendWifiCredentials}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Connecting...' : 'Send Credentials'}
            </Text>
            {loading && <ActivityIndicator size="small" color="#ffffff" />}
          </TouchableOpacity>
        </View>
      )}
      
      {/* RFID Scanner Section - Show this section when we're not in setup mode */}
      {!setupMode && (
        <>
          {/* Last Scanned Card */}
          <Animated.View style={[styles.card, cardHighlightStyle]}>
            <Text style={styles.cardTitle}>Last Scanned Card</Text>
            {lastScannedCard ? (
              <View style={styles.lastCardContainer}>
                <Text style={styles.lastCardUid}>{lastScannedCard.uid}</Text>
                <Text style={styles.lastCardTime}>
                  Scanned at {lastScannedCard.timestamp}
                </Text>
              </View>
            ) : (
              <Text style={styles.noCardText}>
                No card scanned yet. Present a card to the reader.
              </Text>
            )}
          </Animated.View>
          
          {/* Scan History */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Scan History</Text>
            {scanHistory.length > 0 ? (
              <FlatList
                data={scanHistory}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <Text style={styles.historyUid}>{item.uid}</Text>
                    <Text style={styles.historyTime}>{item.timestamp}</Text>
                  </View>
                )}
                scrollEnabled={false}  // Disable scrolling for the nested list
              />
            ) : (
              <Text style={styles.noCardText}>
                No scan history available.
              </Text>
            )}
          </View>
        </>
      )}
      
      {/* Scanner Search Button - Only show when not in setup mode and not connected */}
      {!setupMode && !scannerConnected && (
        <TouchableOpacity
          style={styles.scanButton}
          onPress={findScannerOnNetwork}
          disabled={searching}
        >
          <Text style={styles.buttonText}>
            {searching ? 'Searching...' : 'Search for Scanner'}
          </Text>
          {searching && <ActivityIndicator size="small" color="#ffffff" />}
        </TouchableOpacity>
      )}
      
      {/* Manual IP Button */}
      {!setupMode && (
        <TouchableOpacity
          style={styles.manualButton}
          onPress={showManualIPPrompt}
        >
          <Text style={styles.manualButtonText}>
            Enter Scanner IP Manually
          </Text>
        </TouchableOpacity>
      )}
      
      {/* Help Text */}
      <View style={styles.helpCard}>
        <Text style={styles.helpTitle}>Instructions</Text>
        {setupMode ? (
          <Text style={styles.helpText}>
            1. Connect your phone to the "TapyzeSetup" WiFi network{'\n'}
            2. Enter your home WiFi credentials{'\n'}
            3. After the scanner connects, switch back to your home WiFi{'\n'}
            4. The app will automatically find the scanner on your network
          </Text>
        ) : (
          <Text style={styles.helpText}>
            1. Make sure your phone and scanner are on the same WiFi network{'\n'}
            2. Tap "Search for Scanner" if the scanner is not automatically found{'\n'}
            3. If scanning fails, try entering the scanner's IP manually{'\n'}
            4. Present RFID cards to the scanner to see them appear above
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 16,
    color: '#333',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#4a90e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusText: {
    color: 'white',
    fontWeight: 'bold',
    flex: 1,
  },
  infoCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#555',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#4a90e2',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    marginRight: 8,
  },
  lastCardContainer: {
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 4,
  },
  lastCardUid: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#4a90e2',
  },
  lastCardTime: {
    fontSize: 14,
    color: '#666',
  },
  noCardText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    padding: 16,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyUid: {
    fontWeight: 'bold',
    color: '#333',
  },
  historyTime: {
    color: '#888',
    fontSize: 12,
  },
  scanButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  manualButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#4a90e2',
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
    marginBottom: 16,
  },
  manualButtonText: {
    color: '#4a90e2',
    fontSize: 14,
  },
  helpCard: {
    backgroundColor: '#fffde7',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ffd54f',
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#f57f17',
  },
  helpText: {
    lineHeight: 20,
    color: '#5d4037',
  },
});