import { Text, View, StyleSheet } from 'react-native';

export default function MobileHome() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Canticum Mobile</Text>
      <Text style={styles.subtitle}>Base inicial con Expo + React Native + Firebase</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F5ED',
    padding: 24
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#133f66',
    marginBottom: 10
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#874c72'
  }
});
