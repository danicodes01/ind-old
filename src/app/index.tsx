import { StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder root route.
 *
 * The foundation is deliberately feature-free — this exists so the router has an entry point
 * and the app boots far enough to run migrations. Product screens land under `src/features`
 * and are composed here.
 */
export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>IND</Text>
      <Text style={styles.subtitle}>Foundation</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.5,
  },
});
