import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { db } from '@/data/db/client';
import migrations from '@/data/db/migrations/migrations';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  // A failed migration is not something to route around. This app holds financial records,
  // and continuing against a half-migrated database risks writing rows that cannot be read
  // back. Stopping here is the safe outcome. See ADR-003.
  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.heading}>Database could not be prepared</Text>
        <Text style={styles.detail}>{error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  heading: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  detail: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: 'center',
  },
});
