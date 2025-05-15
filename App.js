import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import ScanAndReadScreen from './app/screen/ScanAndReadScreen';

export default function App() {
  return (
    <View style={styles.container}>
      <ScanAndReadScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
