import { useCallback, useEffect, useState } from 'react';
import {
  DeviceEventEmitter,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  api,
  mediaFileUrl,
  type DefectPart,
  type DefectProcess,
  type DefectType,
  type Issue,
  type IssueStatusHistoryEntry,
  type LocalFile,
  type MediaAttachment,
} from '../api/client';
import {
  Badge,
  Card,
  ErrorText,
  Loading,
  OutlineButton,
  PrimaryButton,
  Screen,
  SectionHeading,
  Subtitle,
  AppTextInput,
} from '../components/ui';
import {
  DefectClassificationFields,
  OTHER_PART_CODE,
  OTHER_TYPE_CODE,
  type DefectClassificationState,
} from '../components/DefectClassificationFields';
import { SeverityIndicator } from '../components/SeverityIndicator';
import { VehicleIdentity } from '../components/VehicleIdentity';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { useAuth } from '../auth/AuthProvider';
import { Perm } from '../auth/permissions';
import { issueStatusColor, issueStatusLabel } from '../lib/issueStatus';
import { prepareUploadImage } from '../lib/prepareUploadImage';
import {
  DismissKeyboardScrollView,
} from '../components/keyboard';
import { formatActionAt } from '../lib/actionStamp';
import { issueStationLabel, reporterFallback, defectLabels } from '../lib/issueDetailCopy';
import { apiErrorMessage } from '../lib/password';
import { useI18n } from '../i18n';
import type { Locale } from '../../../shared/i18n';
import type { RootStackParamList } from '../navigation/types';
import { useConfirm } from '../components/ConfirmDialog';
import { useApprovalUndo } from '../components/ApprovalUndoToast';

function nextOperatorStatus(status: Issue['Status']): Issue['Status'] | null {
  if (status === 'OPEN') return 'IN_PROGRESS';
  if (status === 'IN_PROGRESS') return 'DONE';
  return null;
}

function formatDate(iso: string | undefined, locale: Locale): string {
  return formatActionAt(iso, locale) ?? '—';
}

function InfoRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  const { tokens } = useTheme();
  return (
    <View style={{ marginTop: space[3] }}>
      <Text style={{ color: tokens.textSecondary, fontSize: 12 }}>{label}</Text>
      <Text
        style={{
          color: muted ? tokens.textSecondary : tokens.textPrimary,
          fontSize: muted ? 13 : 15,
          fontWeight: muted ? '500' : '600',
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function IssueDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'IssueDetail'>>();
  const insets = useSafeAreaInsets();
  const { tokens } = useTheme();
  const { has, user } = useAuth();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const { showAfterApproval } = useApprovalUndo();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [history, setHistory] = useState<IssueStatusHistoryEntry[]>([]);
  const [reportPhotos, setReportPhotos] = useState<MediaAttachment[]>([]);
  const [editingClassification, setEditingClassification] = useState(false);
  const [classState, setClassState] = useState<DefectClassificationState>({
    zoneId: null,
    partId: null,
    typeId: null,
    customPartName: '',
    customDefectName: '',
  });
  const [processes, setProcesses] = useState<DefectProcess[]>([]);
  const [processId, setProcessId] = useState<number | null>(null);
  const [catalogParts, setCatalogParts] = useState<DefectPart[]>([]);
  const [catalogTypes, setCatalogTypes] = useState<DefectType[]>([]);
  const [resolutionPhotos, setResolutionPhotos] = useState<MediaAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showDoneForm, setShowDoneForm] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [resolutionPhoto, setResolutionPhoto] = useState<LocalFile | null>(null);
  const [resolutionUploaded, setResolutionUploaded] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const id = route.params.id;
      const [i, hist, report, resolution] = await Promise.all([
        api.getIssue(id),
        api.getIssueHistory(id).catch(() => ({ items: [] as IssueStatusHistoryEntry[] })),
        api.listMedia('ISSUE', String(id)),
        api.listMedia('ISSUE_RESOLUTION', String(id)),
      ]);
      setIssue(i);
      setHistory(hist.items ?? []);
      setReportPhotos(report.items ?? []);
      setResolutionPhotos(resolution.items ?? []);
      if ((resolution.items ?? []).length > 0) {
        setResolutionUploaded(true);
      }
    } catch (err) {
      setError(apiErrorMessage(err, t));
    }
  }, [route.params.id, t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'karea:issue-approval-undone',
      (payload: { issueId?: number }) => {
        if (payload?.issueId === route.params.id) {
          void load();
        }
      },
    );
    return () => sub.remove();
  }, [load, route.params.id]);

  async function pickResolution(from: 'library' | 'camera') {
    if (from === 'library') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(t('issueDetail.galleryDenied'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (asset) {
        try {
          setResolutionPhoto(await prepareUploadImage(asset));
          setResolutionUploaded(false);
        } catch (err) {
          setError(apiErrorMessage(err, t));
        }
      }
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError(t('issueDetail.cameraDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) {
      try {
        setResolutionPhoto(await prepareUploadImage(asset));
        setResolutionUploaded(false);
      } catch (err) {
        setError(apiErrorMessage(err, t));
      }
    }
  }

  async function uploadResolutionPhoto(issueId: number): Promise<boolean> {
    if (!resolutionPhoto) {
      setError(t('issueDetail.solutionPhotoRequired'));
      return false;
    }
    try {
      await api.uploadMedia('ISSUE_RESOLUTION', String(issueId), resolutionPhoto);
      setResolutionUploaded(true);
      return true;
    } catch (err) {
      setError(
        t('issueDetail.resolutionUploadFailed', {
          msg: apiErrorMessage(err, t),
        }),
      );
      setResolutionUploaded(false);
      return false;
    }
  }

  async function advanceToInProgress() {
    if (!issue) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, 'IN_PROGRESS');
      setShowDoneForm(false);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function completeDone() {
    if (!issue) return;
    const desc = solutionText.trim();
    if (!resolutionPhoto && !resolutionUploaded) {
      setError(t('issueDetail.solutionPhotoRequiredHint'));
      return;
    }
    if (!desc) {
      setError(t('issueDetail.solutionDescRequired'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (!resolutionUploaded) {
        const ok = await uploadResolutionPhoto(issue.ID);
        if (!ok) return;
      }
      await api.updateIssueStatus(issue.ID, 'DONE', desc);
      setShowDoneForm(false);
      setSolutionText('');
      setResolutionPhoto(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (!issue && !error) return <Loading />;

  async function applyStatus(status: Issue['Status']) {
    if (!issue) return;
    if (status === 'APPROVED' || status === 'CONDITIONAL_APPROVED') {
      const vinTail = issue.VIN.slice(-5);
      const desc =
        issue.Description.length > 80
          ? `${issue.Description.slice(0, 77)}…`
          : issue.Description;
      const ok = await confirm({
        title:
          status === 'APPROVED'
            ? t('issueDetail.approveConfirmTitle')
            : t('issueDetail.conditionalConfirmTitle'),
        message:
          status === 'APPROVED'
            ? t('issueDetail.approveConfirmMessage', {
                description: desc,
                id: issue.ID,
                vinTail,
              })
            : t('issueDetail.conditionalConfirmMessage', {
                description: desc,
                id: issue.ID,
                vinTail,
              }),
        confirmLabel: t('common.confirm'),
        cancelLabel: t('common.cancel'),
        tone: status === 'CONDITIONAL_APPROVED' ? 'warning' : 'default',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateIssueStatus(issue.ID, status);
      if (status === 'APPROVED' || status === 'CONDITIONAL_APPROVED') {
        showAfterApproval(issue.ID, status);
      }
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  const next = issue ? nextOperatorStatus(issue.Status) : null;
  const canMarkDone = issue?.Status === 'IN_PROGRESS' && has(Perm.IssueTransitionProgress);
  const canApprove = issue?.Status === 'DONE' && has(Perm.IssueTransitionApprove);
  const canConditional =
    issue?.Status === 'DONE' && has(Perm.IssueTransitionConditionalApprove);
  const canEditClassification =
    !!issue &&
    ((user?.ID != null && issue.IssueReporterID === user.ID) ||
      has(Perm.IssueTransitionApprove) ||
      has(Perm.IssueTransitionConditionalApprove) ||
      has(Perm.AdminManageMasters));

  function startEditClassification() {
    if (!issue) return;
    setClassState({
      zoneId: issue.DefectZoneID ?? null,
      partId: issue.DefectPartID ?? null,
      typeId: issue.DefectTypeID ?? null,
      customPartName: issue.CustomPartName ?? '',
      customDefectName: issue.CustomDefectName ?? '',
    });
    setProcessId(issue.ResponsibleProcessID ?? null);
    setEditingClassification(true);
    void api.listDefectCatalogProcesses().then((r) => setProcesses(r.items ?? []));
  }

  async function saveClassification() {
    if (!issue || classState.partId == null || classState.typeId == null || processId == null) {
      setError(t('issue.classificationIncomplete'));
      return;
    }
    const part = catalogParts.find((p) => p.ID === classState.partId);
    const typ = catalogTypes.find((ty) => ty.ID === classState.typeId);
    if (part?.Code === OTHER_PART_CODE && !classState.customPartName.trim()) {
      setError(t('report.customPartRequired'));
      return;
    }
    if (typ?.Code === OTHER_TYPE_CODE && !classState.customDefectName.trim()) {
      setError(t('report.customDefectRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateIssueClassification(issue.ID, {
        defect_part_id: classState.partId,
        defect_type_id: classState.typeId,
        responsible_process_id: processId,
        custom_part_name:
          part?.Code === OTHER_PART_CODE
            ? classState.customPartName.trim()
            : undefined,
        custom_defect_name:
          typ?.Code === OTHER_TYPE_CODE
            ? classState.customDefectName.trim()
            : undefined,
      });
      setIssue(updated);
      setEditingClassification(false);
    } catch (err) {
      setError(apiErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <DismissKeyboardScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 48 }}>
        {issue ? (
          <View style={{ gap: space[4] }}>
            <Card style={{ marginTop: 0 }}>
              <VehicleIdentity vin={issue.VIN} variant="hero" />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space[2],
                  marginTop: space[4],
                }}
              >
                <SeverityIndicator severity={issue.Severity} size="md" />
                <Badge
                  label={issueStatusLabel(issue.Status, t)}
                  color={issueStatusColor(issue.Status)}
                />
              </View>
              <Text
                style={{
                  color: tokens.textPrimary,
                  fontSize: 17,
                  fontWeight: '600',
                  lineHeight: 24,
                  marginTop: space[5],
                }}
              >
                {issue.Description}
              </Text>
              <InfoRow
                label={t('issueDetail.reporter')}
                value={issue.ReporterName || reporterFallback(t, issue.IssueReporterID)}
              />
              <InfoRow
                label={t('issueDetail.issueType')}
                value={issue.IssueTypeName || t('common.emDash')}
              />
              <InfoRow
                label={t('issueDetail.station')}
                value={issueStationLabel(issue)}
              />
              <InfoRow
                label={t('issueDetail.reportedAt')}
                value={formatDate(issue.IssueDate || issue.CreatedAt, locale)}
              />
              {editingClassification ? (
                <View style={{ marginTop: space[3], gap: 10 }}>
                  <Text style={{ color: tokens.textPrimary, fontWeight: '700', fontSize: 15 }}>
                    {t('issue.editClassification')}
                  </Text>
                  <DefectClassificationFields
                    zoneId={classState.zoneId}
                    partId={classState.partId}
                    typeId={classState.typeId}
                    customPartName={classState.customPartName}
                    customDefectName={classState.customDefectName}
                    onChange={(patch) => {
                      setClassState((prev) => {
                        const next = { ...prev, ...patch };
                        if (patch.typeId != null) {
                          const typ = catalogTypes.find((ty) => ty.ID === patch.typeId);
                          if (typ?.DefaultProcessID) setProcessId(typ.DefaultProcessID);
                        }
                        return next;
                      });
                    }}
                    locale={locale}
                    onCatalogLoaded={(parts, types) => {
                      setCatalogParts(parts);
                      setCatalogTypes(types);
                    }}
                  />
                  <Text style={{ color: tokens.textSecondary, fontWeight: '600', fontSize: 13 }}>
                    {t('issue.defectProcess')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {processes.map((p) => {
                      const selected = processId === p.ID;
                      const label = locale === 'en' ? p.NameEN || p.NameTR : p.NameTR || p.NameEN;
                      return (
                        <Pressable
                          key={p.ID}
                          onPress={() => setProcessId(p.ID)}
                          style={{
                            paddingHorizontal: 12,
                            minHeight: 40,
                            borderRadius: 999,
                            backgroundColor: selected
                              ? tokens.textPrimary
                              : tokens.bgSurface2,
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: selected ? tokens.bgPage : tokens.textSecondary,
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <PrimaryButton
                    label={busy ? t('common.saving') : t('common.save')}
                    onPress={() => void saveClassification()}
                    disabled={busy}
                  />
                  <OutlineButton
                    label={t('common.cancel')}
                    onPress={() => setEditingClassification(false)}
                  />
                </View>
              ) : (
                <>
                  {(() => {
                    const d = defectLabels(issue, t, locale);
                    return (
                      <>
                        <InfoRow label={t('issue.defectZone')} value={d.zone} />
                        <InfoRow label={t('issue.defectPart')} value={d.part} />
                        <InfoRow label={t('issue.defectType')} value={d.type} />
                        <InfoRow label={t('issue.defectProcess')} value={d.process} />
                        <InfoRow label={t('issue.defectCode')} value={d.code} muted />
                      </>
                    );
                  })()}
                  {canEditClassification ? (
                    <View style={{ marginTop: space[3] }}>
                      <OutlineButton
                        label={t('issue.editClassification')}
                        onPress={startEditClassification}
                      />
                    </View>
                  ) : null}
                </>
              )}
              {issue.SolutionDescription?.trim() ? (
                <InfoRow
                  label={t('issueDetail.solution')}
                  value={issue.SolutionDescription.trim()}
                />
              ) : null}

              {next === 'IN_PROGRESS' && has(Perm.IssueTransitionProgress) ? (
                <View style={{ marginTop: space[5] }}>
                  <PrimaryButton
                    label={busy ? t('common.updating') : t('status.issue.inProgress')}
                    onPress={() => void advanceToInProgress()}
                    disabled={busy}
                  />
                </View>
              ) : null}

              {canMarkDone && !showDoneForm ? (
                <View style={{ marginTop: space[5] }}>
                  <PrimaryButton
                    label={t('status.issue.done')}
                    onPress={() => {
                      setShowDoneForm(true);
                      setError(null);
                    }}
                    disabled={busy}
                  />
                </View>
              ) : null}

              {canMarkDone && showDoneForm ? (
                <View style={{ marginTop: space[5] }}>
                  <Text
                    style={{
                      color: tokens.textPrimary,
                      fontWeight: '700',
                      fontSize: 16,
                      marginBottom: 8,
                    }}
                  >
                    {t('issueDetail.completionProof')}
                  </Text>
                  <Subtitle>
                    {t('issueDetail.completionHint')}
                  </Subtitle>

                  <Text
                    style={{
                      color: tokens.textSecondary,
                      fontWeight: '600',
                      fontSize: 13,
                      marginTop: 12,
                    }}
                  >
                    {t('issueDetail.solutionPhoto')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <OutlineButton
                        label={t('common.camera')}
                        onPress={() => void pickResolution('camera')}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <OutlineButton
                        label={t('common.gallery')}
                        onPress={() => void pickResolution('library')}
                      />
                    </View>
                  </View>
                  {resolutionPhoto ? (
                    <View style={{ marginTop: 8 }}>
                      <Image
                        source={{ uri: resolutionPhoto.uri }}
                        style={{
                          width: '100%',
                          height: 160,
                          borderRadius: 10,
                          backgroundColor: tokens.bgSurface2,
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                        {resolutionUploaded
                          ? t('issueDetail.photoUploaded')
                          : t('issueDetail.photoPicked')}
                      </Text>
                    </View>
                  ) : null}

                  <Text
                    style={{
                      color: tokens.textSecondary,
                      fontWeight: '600',
                      fontSize: 13,
                      marginTop: 16,
                    }}
                  >
                    {t('issueDetail.descriptionStar')}
                  </Text>
                  <AppTextInput
                    value={solutionText}
                    onChangeText={setSolutionText}
                    placeholder={t('issueDetail.repairNote')}
                    placeholderTextColor={tokens.textSecondary}
                    multiline
                    style={{
                      marginTop: 8,
                      minHeight: 100,
                      borderWidth: 1,
                      borderColor: tokens.border,
                      borderRadius: 10,
                      padding: 12,
                      color: tokens.textPrimary,
                      backgroundColor: tokens.bgSurface1,
                      textAlignVertical: 'top',
                    }}
                  />

                  <View style={{ marginTop: 16 }}>
                    <PrimaryButton
                      label={
                        busy
                          ? t('common.saving')
                          : resolutionUploaded
                            ? t('issueDetail.saveDone')
                            : t('issueDetail.uploadAndDone')
                      }
                      onPress={() => void completeDone()}
                      disabled={
                        busy ||
                        (!resolutionPhoto && !resolutionUploaded) ||
                        !solutionText.trim()
                      }
                    />
                  </View>
                  {resolutionPhoto && !resolutionUploaded ? (
                    <View style={{ marginTop: 8 }}>
                      <OutlineButton
                        label={t('issueDetail.retryPhoto')}
                        onPress={() => void uploadResolutionPhoto(issue.ID)}
                      />
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => setShowDoneForm(false)}
                    style={{ marginTop: 12, minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ color: tokens.textSecondary, textAlign: 'center' }}>
                      {t('common.cancel')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {canApprove || canConditional ? (
                <View style={{ marginTop: space[5], gap: 8 }}>
                  {canApprove ? (
                    <PrimaryButton
                      label={busy ? t('common.updating') : t('status.issue.approved')}
                      onPress={() => void applyStatus('APPROVED')}
                      disabled={busy}
                    />
                  ) : null}
                  {canConditional ? (
                    <OutlineButton
                      label={busy ? t('common.updating') : t('status.issue.conditionalApproved')}
                      onPress={() => {
                        if (!busy) void applyStatus('CONDITIONAL_APPROVED');
                      }}
                    />
                  ) : null}
                </View>
              ) : null}

              {!has(Perm.IssueTransitionProgress) &&
              !has(Perm.IssueTransitionApprove) &&
              !has(Perm.IssueTransitionConditionalApprove) ? (
                <View style={{ marginTop: space[5] }}>
                  <Subtitle>{t('issueDetail.noAction')}</Subtitle>
                </View>
              ) : issue.Status === 'DONE' && !canApprove && !canConditional ? (
                <View style={{ marginTop: space[5] }}>
                  <Subtitle>{t('issueDetail.awaitingQuality')}</Subtitle>
                </View>
              ) : !next && !canMarkDone && !canApprove && !canConditional ? (
                <View style={{ marginTop: space[5] }}>
                  <Subtitle>{t('issueDetail.noTransition')}</Subtitle>
                </View>
              ) : null}
            </Card>

            <Card style={{ marginTop: 0 }}>
              <SectionHeading>{t('issueDetail.history')}</SectionHeading>
              {history.length === 0 ? (
                <Subtitle>{t('vehicles.historyEmpty')}</Subtitle>
              ) : (
                history.map((row) => (
                  <View key={row.ID} style={{ marginTop: space[2] }}>
                    <Text style={{ color: tokens.textPrimary, fontWeight: '600', fontSize: 14 }}>
                      {issueStatusLabel(row.FromStatus || '', t)} → {issueStatusLabel(row.ToStatus || '', t)}:{' '}
                      {row.ActorName || t('common.emDash')}, {formatDate(row.EventAt, locale)}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            <Card style={{ marginTop: 0 }}>
              <SectionHeading>{t('issueDetail.photos')}</SectionHeading>
              <Text
                style={{
                  color: tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: '500',
                  marginTop: space[3],
                }}
              >
                {t('issueDetail.reportPhotos')}
              </Text>
              {reportPhotos.length === 0 ? (
                <Subtitle>{t('issueDetail.photosEmpty')}</Subtitle>
              ) : (
                reportPhotos.map((p) => {
                  const uri = mediaFileUrl(p.storage_path);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setViewerUri(uri)}
                      style={{ marginTop: space[3] }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={t('issueDetail.enlarge', { name: p.file_name })}
                    >
                      <Image
                        source={{ uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 10,
                          backgroundColor: tokens.bgSurface2,
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                        {p.file_name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
              <Text
                style={{
                  color: tokens.textSecondary,
                  fontSize: 13,
                  fontWeight: '500',
                  marginTop: space[5],
                }}
              >
                {t('issueDetail.resolutionPhotos')}
              </Text>
              {resolutionPhotos.length === 0 ? (
                <Subtitle>{t('issueDetail.photosEmpty')}</Subtitle>
              ) : (
                resolutionPhotos.map((p) => {
                  const uri = mediaFileUrl(p.storage_path);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setViewerUri(uri)}
                      style={{ marginTop: space[3] }}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={t('issueDetail.enlarge', { name: p.file_name })}
                    >
                      <Image
                        source={{ uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          borderRadius: 10,
                          backgroundColor: tokens.bgSurface2,
                        }}
                        resizeMode="cover"
                      />
                      <Text style={{ color: tokens.textSecondary, marginTop: 4, fontSize: 12 }}>
                        {p.file_name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </Card>
          </View>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </DismissKeyboardScrollView>

      <Modal
        visible={!!viewerUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerUri(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.92)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setViewerUri(null)}
        >
          <Pressable
            onPress={() => setViewerUri(null)}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              right: 20 + insets.right,
              zIndex: 2,
              minHeight: 44,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('issueDetail.closePhoto')}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('common.close')}</Text>
          </Pressable>
          {viewerUri ? (
            <Image
              source={{ uri: viewerUri }}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </Screen>
  );
}
