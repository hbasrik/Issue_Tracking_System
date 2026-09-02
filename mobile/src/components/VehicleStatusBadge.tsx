import { Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { eolStageLabel, vehicleStatusLabel } from '../lib/vehicleStatus';
import { useTheme } from '../theme/ThemeProvider';
import { statusColors } from '../theme/tokens';
import { Badge } from './ui';

function vehicleStatusColor(status: string): string {
  switch (status) {
    case 'PLANNED':
      return statusColors.pending;
    case 'IN_PRODUCTION':
      return statusColors.vehicleInProduction;
    case 'IN_WAREHOUSE':
      return statusColors.vehicleInWarehouse;
    case 'DELIVERED':
    case 'WITH_CUSTOMER':
      return statusColors.vehicleWithCustomer;
    case 'SHIPPED':
      return statusColors.vehicleShipped;
    case 'ON_HOLD':
      return statusColors.vehicleOnHold;
    default:
      return statusColors.pending;
  }
}

export function VehicleStatusBadge({
  status,
  eolStage,
}: {
  status: string;
  eolStage?: string | null;
}) {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const fill = vehicleStatusColor(status);
  const stage = eolStage?.trim();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      <Badge label={vehicleStatusLabel(status, t)} color={fill} />
      {stage ? (
        <Text style={{ fontSize: 12, color: tokens.textSecondary }}>
          · {eolStageLabel(stage, t)}
        </Text>
      ) : null}
    </View>
  );
}
