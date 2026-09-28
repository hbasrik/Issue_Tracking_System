import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ChecklistItem } from '../api/client';
import { Card } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n';
import { checklistRecordLabel } from '../lib/vehicleStatus';

/**
 * Read-only, collapsed-by-default list of checklist items outside the work
 * queue (inactive catalogue items, or items whose stage is closed). Rows are
 * not pressable and count in no total.
 */
export function ChecklistCollapsedSection({
  title,
  hint,
  badge,
  items,
  testID,
  itemTestIDPrefix,
}: {
  title: string;
  hint: string;
  badge: string;
  items: ChecklistItem[];
  testID: string;
  itemTestIDPrefix?: string;
}) {
  const { tokens } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" testID={testID}>
        <Text style={{ color: tokens.textSecondary, fontWeight: '600', fontSize: 14 }}>
          {title}
          {open ? ' ▾' : ' ▸'}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: tokens.textSecondary, fontSize: 12, marginBottom: 8 }}>
            {hint}
          </Text>
          {items.map((item) => (
            <View
              key={item.ItemID}
              style={{
                marginTop: 8,
                paddingVertical: 8,
                borderTopWidth: 1,
                borderTopColor: tokens.border,
                opacity: 0.7,
              }}
              testID={itemTestIDPrefix ? `${itemTestIDPrefix}${item.ItemID}` : undefined}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Text style={{ color: tokens.textPrimary, fontSize: 14, flex: 1 }}>
                  {item.ItemNo}. {item.ItemText}
                </Text>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: tokens.border,
                  }}
                >
                  <Text style={{ color: tokens.textSecondary, fontSize: 11, fontWeight: '700' }}>
                    {badge}
                  </Text>
                </View>
              </View>
              <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 4 }}>
                {checklistRecordLabel(item.Status, t)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
