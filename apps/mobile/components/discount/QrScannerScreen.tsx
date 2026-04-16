import { useCampsiteTheme } from '@campsite/ui';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type VerifyResult = {
  valid: true;
  name: string;
  role: string;
  department: string;
  discount_label: string | null;
  discount_value: string | null;
  valid_at: string | null;
} | {
  valid: false;
  error: string;
};

function buildDemoResult(data: string): VerifyResult {
  if (!data.trim()) {
    return { valid: false, error: 'No QR data found.' };
  }

  return {
    valid: true,
    name: 'Demo staff member',
    role: 'org_admin',
    department: 'Frontend preview',
    discount_label: 'Frontend preview only',
    discount_value: null,
    valid_at: 'Verification backend removed',
  };
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function QrScannerScreen() {
  const { tokens } = useCampsiteTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const lastScanned = useRef<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      // Debounce — ignore same token within 3s
      if (scanning || data === lastScanned.current) return;
      lastScanned.current = data;
      setScanning(true);
      setResult(null);

      try {
        setResult(buildDemoResult(data));
      } catch (e) {
        setResult({ valid: false, error: e instanceof Error ? e.message : 'Preview failed' });
      } finally {
        setScanning(false);
        // Allow re-scan after 3s
        cooldownRef.current = setTimeout(() => {
          lastScanned.current = null;
        }, 3000);
      }
    },
    [scanning],
  );

  const reset = useCallback(() => {
    setResult(null);
    lastScanned.current = null;
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
  }, []);

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={[styles.screen, { backgroundColor: '#000' }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={[styles.screen, { backgroundColor: tokens.background }]}>
        <View style={styles.permissionBox}>
          <Text style={[styles.permTitle, { color: tokens.textPrimary }]}>Camera access needed</Text>
          <Text style={[styles.permBody, { color: tokens.textSecondary }]}>
            Camera access is required to scan staff discount QR codes.
          </Text>
          <Pressable style={styles.permBtn} onPress={() => void requestPermission()}>
            <Text style={styles.permBtnText}>Grant access</Text>
          </Pressable>
          <Pressable style={[styles.backBtn, { borderColor: tokens.border }]} onPress={() => router.back()}>
            <Text style={[styles.backBtnText, { color: tokens.textSecondary }]}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={result ? undefined : onBarcodeScanned}
      />

      {/* Dark overlay with cutout effect */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={styles.viewfinder}>
            {/* Corner marks */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Scan staff card</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hint */}
      {!result && !scanning ? (
        <View style={styles.hintBox} pointerEvents="none">
          <Text style={styles.hintText}>Point at a staff member's QR code for a frontend-only preview</Text>
        </View>
      ) : null}

      {/* Scanning spinner */}
      {scanning ? (
        <View style={styles.hintBox} pointerEvents="none">
          <ActivityIndicator color="#fff" style={{ marginBottom: 6 }} />
          <Text style={styles.hintText}>Loading preview…</Text>
        </View>
      ) : null}

      {/* Result card */}
      {result ? (
        <View style={styles.resultWrapper}>
          {result.valid ? (
            <View style={[styles.resultCard, styles.resultCardValid]}>
              <View style={styles.resultHeader}>
                <View style={styles.validDot} />
                <Text style={styles.validLabel}>Valid card</Text>
              </View>
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultRole}>{formatRole(result.role)}</Text>
              {result.department && result.department !== '-' ? (
                <Text style={styles.resultDept}>{result.department}</Text>
              ) : null}
              {result.discount_value || result.discount_label ? (
                <View style={styles.discountRow}>
                  <Text style={styles.discountLabel}>{result.discount_label ?? 'Discount'}</Text>
                  <Text style={styles.discountValue}>{result.discount_value ?? ''}</Text>
                </View>
              ) : null}
              {result.valid_at ? (
                <Text style={styles.validAt}>Valid at: {result.valid_at}</Text>
              ) : null}
              <Pressable style={styles.scanAgainBtn} onPress={reset}>
                <Text style={styles.scanAgainText}>Scan another</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.resultCard, styles.resultCardInvalid]}>
              <View style={styles.resultHeader}>
                <View style={styles.invalidDot} />
                <Text style={styles.invalidLabel}>Preview unavailable</Text>
              </View>
              <Text style={styles.invalidMessage}>{result.error}</Text>
              <Pressable style={styles.scanAgainBtn} onPress={reset}>
                <Text style={styles.scanAgainText}>Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const VIEWFINDER = 240;
const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;
const CORNER_COLOR = '#fff';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject, flexDirection: 'column' },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayMiddle: { height: VIEWFINDER, flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayBottom: { flex: 1.4, backgroundColor: 'rgba(0,0,0,0.55)' },
  viewfinder: { width: VIEWFINDER, height: VIEWFINDER },

  // Corners
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: CORNER_COLOR,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_THICKNESS, borderLeftWidth: CORNER_THICKNESS },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_THICKNESS, borderRightWidth: CORNER_THICKNESS },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },

  // Hint
  hintBox: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
  },

  // Permission
  permissionBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  permBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  permBtn: {
    backgroundColor: '#008B60',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginBottom: 12,
  },
  permBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  backBtn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28, borderWidth: 1 },
  backBtnText: { fontWeight: '600', fontSize: 15 },

  // Result
  resultWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 36,
  },
  resultCard: {
    borderRadius: 18,
    padding: 20,
  },
  resultCardValid: { backgroundColor: '#0a1a13', borderWidth: 1, borderColor: '#008B60' },
  resultCardInvalid: { backgroundColor: '#1a0a0a', borderWidth: 1, borderColor: '#dc2626' },
  resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  validDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#008B60' },
  validLabel: { color: '#008B60', fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  invalidDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#dc2626' },
  invalidLabel: { color: '#dc2626', fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultName: { color: '#faf9f6', fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginBottom: 2 },
  resultRole: { color: 'rgba(250,249,246,0.6)', fontSize: 13, textTransform: 'capitalize', marginBottom: 2 },
  resultDept: { color: 'rgba(250,249,246,0.45)', fontSize: 12, marginBottom: 12 },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,139,96,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  discountLabel: { color: 'rgba(250,249,246,0.55)', fontSize: 13 },
  discountValue: { color: '#4ade80', fontSize: 20, fontWeight: '700' },
  validAt: { color: 'rgba(250,249,246,0.35)', fontSize: 11, marginBottom: 12 },
  invalidMessage: { color: 'rgba(250,249,246,0.7)', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  scanAgainBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanAgainText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
