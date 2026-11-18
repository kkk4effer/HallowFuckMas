import JSZip from 'jszip';
import type { ApkBuildConfig } from '../types/nfc';

export interface AndroidSourceFile {
  path: string;
  label: string;
  language: 'kotlin' | 'xml' | 'gradle';
  content: string;
}

export function generateAndroidSourceFiles(config: ApkBuildConfig): AndroidSourceFile[] {
  const pkgPath = config.packageId.replace(/\./g, '/');
  const cleanCashTag = config.cashTag.startsWith('$') ? config.cashTag : `$${config.cashTag}`;
  const cashAppUrl = `https://cash.app/${cleanCashTag}/${config.unlockPriceUsd}`;

  const androidManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${config.packageId}"
    android:versionCode="${config.versionCode}"
    android:versionName="${config.versionName}">

    <uses-permission android:name="android.permission.NFC" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-feature android:name="android.hardware.nfc" android:required="true" />
    <uses-feature android:name="android.hardware.usb.host" android:required="true" />

    <application
        android:allowBackup="false"
        android:label="${config.appName}"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">

        <!-- CashApp $${config.unlockPriceUsd} Paywall Frontpage Launcher -->
        <activity
            android:name=".PaywallActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Post-Paywall Select Option Page (Both Options + NDEF Tag Files) -->
        <activity
            android:name=".SelectOptionActivity"
            android:exported="false" />

        <!-- Option 1: NFC & USB TX/RX Bridge -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.nfc.action.NDEF_DISCOVERED" />
                <action android:name="android.nfc.action.TECH_DISCOVERED" />
                <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />
            </intent-filter>
        </activity>

        <!-- Option 2: Bruce Firmware ESP32-C6 Companion -->
        <activity
            android:name=".BruceCompanionActivity"
            android:exported="false" />

        <!-- Option 3: NFC NDEF Tag Files & Phone Emulation -->
        <activity
            android:name=".NdefTagFilesActivity"
            android:exported="false" />

        <service
            android:name=".BruceHceService"
            android:exported="true"
            android:permission="android.permission.BIND_NFC_SERVICE">
            <intent-filter>
                <action android:name="android.nfc.cardemulation.action.HOST_APDU_SERVICE" />
            </intent-filter>
        </service>
    </application>
</manifest>
`;

  const paywallActivity = `package ${config.packageId}

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class PaywallActivity : AppCompatActivity() {

    companion object {
        const val CASHTAG = "${cleanCashTag}"
        const val UNLOCK_PRICE_USD = ${config.unlockPriceUsd}
        const val CASHAPP_PAYMENT_URI = "${cashAppUrl}"
        const val PREFS_NAME = "brucelink_license_prefs"
        const val KEY_UNLOCKED = "paywall_unlocked"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (${!config.requirePaywallOnLaunch} || prefs.getBoolean(KEY_UNLOCKED, false)) {
            launchOptionSelector()
            return
        }

        setContentView(R.layout.activity_paywall)

        findViewById<TextView>(R.id.tvCashTag).text = CASHTAG
        findViewById<TextView>(R.id.tvPrice).text = "$$UNLOCK_PRICE_USD.00 USD"

        findViewById<Button>(R.id.btnPayCashApp).setOnClickListener {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(CASHAPP_PAYMENT_URI))
            startActivity(intent)
        }

        findViewById<Button>(R.id.btnVerifyUnlock).setOnClickListener {
            val receiptCode = findViewById<EditText>(R.id.etReceiptRef).text.toString().trim()
            if (receiptCode.length >= 4) {
                prefs.edit().putBoolean(KEY_UNLOCKED, true).apply()
                Toast.makeText(this, "Unlocked via CashApp ($CASHTAG)", Toast.LENGTH_SHORT).show()
                launchOptionSelector()
            } else {
                Toast.makeText(this, "Enter CashApp receipt ID after sending $$UNLOCK_PRICE_USD to $CASHTAG", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun launchOptionSelector() {
        startActivity(Intent(this, SelectOptionActivity::class.java))
        finish()
    }
}
`;

  const selectOptionActivity = `package ${config.packageId}

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

class SelectOptionActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_select_option)

        // Option 1: NFC & USB TX/RX Bridge (Mobile Wallet Version)
        findViewById<Button>(R.id.btnOptionNfcBridge).setOnClickListener {
            startActivity(Intent(this, MainActivity::class.java))
        }

        // Option 2: Bruce Firmware ESP32-C6 Companion App
        findViewById<Button>(R.id.btnOptionBruceApp).setOnClickListener {
            startActivity(Intent(this, BruceCompanionActivity::class.java))
        }

        // Option 1 + 2: Combined Dual-Bridge Mode (Both Versions Active)
        findViewById<Button>(R.id.btnOptionCombined).setOnClickListener {
            val intent = Intent(this, MainActivity::class.java)
            intent.putExtra("enable_bruce_companion_overlay", true)
            startActivity(intent)
        }

        // Page 3: NFC NDEF Tag Files (Download .ndef + Phone Emulate)
        findViewById<Button>(R.id.btnOptionNdefFiles).setOnClickListener {
            startActivity(Intent(this, NdefTagFilesActivity::class.java))
        }
    }
}
`;

  const bruceCompanionActivity = `package ${config.packageId}

import android.hardware.usb.UsbManager
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class BruceCompanionActivity : AppCompatActivity() {

    private lateinit var usbBridge: UsbSerialBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_bruce_companion)

        usbBridge = UsbSerialBridge(getSystemService(USB_SERVICE) as UsbManager, ${config.baudRate})
        val connected = usbBridge.openFirstEsp32C6Device()
        findViewById<TextView>(R.id.tvBruceStatus).text =
            if (connected) "ESP32-C6 Bruce Linked (${config.baudRate} baud)" else "Waiting for ESP32-C6 USB"

        findViewById<Button>(R.id.btnBruceScan).setOnClickListener {
            usbBridge.relayNfcFrame("CMD", "nfc scan")
        }

        findViewById<Button>(R.id.btnBruceRelayUsb).setOnClickListener {
            usbBridge.relayNfcFrame("CMD", "nfc relay --usb")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        usbBridge.close()
    }
}
`;

  const mainActivity = `package ${config.packageId}

import android.app.PendingIntent
import android.content.Intent
import android.hardware.usb.UsbManager
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private var nfcAdapter: NfcAdapter? = null
    private lateinit var usbBridge: UsbSerialBridge
    private val keepAliveHandler = Handler(Looper.getMainLooper())
    private var keepAliveSeq = 1

    private val keepAliveRunnable = object : Runnable {
        override fun run() {
            if (${config.autoStartUsbTxRx}) {
                usbBridge.sendKeepAlive(keepAliveSeq++)
            }
            keepAliveHandler.postDelayed(this, 2000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        nfcAdapter = NfcAdapter.getDefaultAdapter(this)
        usbBridge = UsbSerialBridge(getSystemService(USB_SERVICE) as UsbManager, ${config.baudRate})
        usbBridge.openFirstEsp32C6Device()
        keepAliveHandler.post(keepAliveRunnable)
    }

    override fun onResume() {
        super.onResume()
        val intent = Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_MUTABLE)
        nfcAdapter?.enableForegroundDispatch(this, pending, null, null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val tag: Tag? = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
        tag?.let {
            val uidHex = it.id.joinToString(":") { b -> "%02X".format(b) }
            usbBridge.relayNfcFrame(uidHex, it.techList.joinToString(","))
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        keepAliveHandler.removeCallbacks(keepAliveRunnable)
        usbBridge.close()
    }
}
`;

  const ndefFilesActivity = `package ${config.packageId}

import android.content.Intent
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.os.Bundle
import android.os.Environment
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.File

class NdefTagFilesActivity : AppCompatActivity() {

    private var activeEmulationMessage: NdefMessage? = null

    fun saveNdefFileToDownloads(fileName: String, uriPayload: String) {
        val record = NdefRecord.createUri(uriPayload)
        val msg = NdefMessage(arrayOf(record))
        val outFile = File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName)
        outFile.writeBytes(msg.toByteArray())
        Toast.makeText(this, "Saved $fileName", Toast.LENGTH_SHORT).show()
    }

    fun startPhoneNdefEmulation(uriPayload: String) {
        val adapter = NfcAdapter.getDefaultAdapter(this)
        if (adapter == null || !adapter.isEnabled) {
            Toast.makeText(this, "Enable Android NFC in Settings", Toast.LENGTH_SHORT).show()
            return
        }
        activeEmulationMessage = NdefMessage(arrayOf(NdefRecord.createUri(uriPayload)))
        val hceIntent = Intent(this, BruceHceService::class.java)
        hceIntent.putExtra("ndef_bytes", activeEmulationMessage?.toByteArray())
        startService(hceIntent)
        Toast.makeText(this, "Emulating NDEF tag on Phone", Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_ndef_files)
    }
}
`;

  const usbBridgeKt = `package ${config.packageId}

import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbManager

class UsbSerialBridge(
    private val usbManager: UsbManager,
    private val baudRate: Int = ${config.baudRate}
) {
    private var connection: UsbDeviceConnection? = null
    private var txEndpoint: UsbEndpoint? = null

    fun openFirstEsp32C6Device(): Boolean {
        val device = usbManager.deviceList.values.firstOrNull {
            it.vendorId == 0x303A || it.vendorId == 0x10C4 || it.vendorId == 0x1A86
        } ?: return false

        val iface = device.getInterface(0)
        val conn = usbManager.openDevice(device) ?: return false
        conn.claimInterface(iface, true)
        conn.controlTransfer(0x21, 0x20, 0, 0, byteArrayOf(
            (baudRate and 0xFF).toByte(),
            ((baudRate shr 8) and 0xFF).toByte(),
            ((baudRate shr 16) and 0xFF).toByte(),
            ((baudRate shr 24) and 0xFF).toByte(),
            0, 0, 8
        ), 7, 1000)

        connection = conn
        return true
    }

    fun relayNfcFrame(uid: String, tech: String) {
        val payload = "NFC|\$tech|\$uid|BRUCE_RELAY\\n".toByteArray()
        txEndpoint?.let { ep -> connection?.bulkTransfer(ep, payload, payload.size, 500) }
    }

    fun sendKeepAlive(seq: Int) {
        val frame = "BRUCE_KA_TXRX#\$seq\\n".toByteArray()
        txEndpoint?.let { ep -> connection?.bulkTransfer(ep, frame, frame.size, 250) }
    }

    fun close() {
        connection?.close()
        connection = null
    }
}
`;

  const selectOptionXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:background="#0B0F17"
    android:gravity="center_vertical">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Select App Mode"
        android:textColor="#FFFFFF"
        android:textSize="24sp"
        android:textStyle="bold" />

    <Button
        android:id="@+id/btnOptionNfcBridge"
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:layout_marginTop="20dp"
        android:backgroundTint="#EA580C"
        android:text="1. NFC &amp; USB TX/RX Bridge"
        android:textColor="#FFFFFF" />

    <Button
        android:id="@+id/btnOptionBruceApp"
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:layout_marginTop="12dp"
        android:backgroundTint="#1E293B"
        android:text="2. Bruce Firmware ESP32-C6 App"
        android:textColor="#FFFFFF" />

    <Button
        android:id="@+id/btnOptionCombined"
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:layout_marginTop="12dp"
        android:backgroundTint="#2563EB"
        android:text="1 + 2. Both Versions Together"
        android:textColor="#FFFFFF" />

    <Button
        android:id="@+id/btnOptionNdefFiles"
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:layout_marginTop="12dp"
        android:backgroundTint="#059669"
        android:text="3. NFC NDEF Tag Files &amp; Emulate"
        android:textColor="#FFFFFF" />
</LinearLayout>
`;

  const paywallXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp"
    android:background="#0B0F17"
    android:gravity="center_vertical">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="${config.appName}"
        android:textColor="#FFFFFF"
        android:textSize="26sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/tvPrice"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="$${config.unlockPriceUsd}.00 USD · One-Time Unlock"
        android:textColor="#FB923C"
        android:textSize="18sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/tvCashTag"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:text="CashApp to: ${cleanCashTag}"
        android:textColor="#00D632"
        android:textSize="22sp"
        android:textStyle="bold" />

    <Button
        android:id="@+id/btnPayCashApp"
        android:layout_width="match_parent"
        android:layout_height="52dp"
        android:layout_marginTop="24dp"
        android:backgroundTint="#00D632"
        android:text="Pay $${config.unlockPriceUsd} via CashApp (${cleanCashTag})"
        android:textColor="#0B0F17" />

    <EditText
        android:id="@+id/etReceiptRef"
        android:layout_width="match_parent"
        android:layout_height="48dp"
        android:layout_marginTop="16dp"
        android:hint="Enter CashApp receipt ID"
        android:textColor="#FFFFFF"
        android:textColorHint="#64748B" />

    <Button
        android:id="@+id/btnVerifyUnlock"
        android:layout_width="match_parent"
        android:layout_height="48dp"
        android:layout_marginTop="12dp"
        android:backgroundTint="#EA580C"
        android:text="Verify Payment &amp; Unlock"
        android:textColor="#FFFFFF" />
</LinearLayout>
`;

  const buildGradle = `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "${config.packageId}"
    compileSdk = ${config.targetSdk}

    defaultConfig {
        applicationId = "${config.packageId}"
        minSdk = ${config.minSdk}
        targetSdk = ${config.targetSdk}
        versionCode = ${config.versionCode}
        versionName = "${config.versionName}"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
`;

  return [
    {
      path: `app/src/main/java/${pkgPath}/PaywallActivity.kt`,
      label: 'PaywallActivity.kt',
      language: 'kotlin',
      content: paywallActivity,
    },
    {
      path: `app/src/main/java/${pkgPath}/SelectOptionActivity.kt`,
      label: 'SelectOptionActivity.kt',
      language: 'kotlin',
      content: selectOptionActivity,
    },
    {
      path: `app/src/main/java/${pkgPath}/MainActivity.kt`,
      label: 'MainActivity.kt',
      language: 'kotlin',
      content: mainActivity,
    },
    {
      path: `app/src/main/java/${pkgPath}/BruceCompanionActivity.kt`,
      label: 'BruceCompanionActivity.kt',
      language: 'kotlin',
      content: bruceCompanionActivity,
    },
    {
      path: `app/src/main/java/${pkgPath}/NdefTagFilesActivity.kt`,
      label: 'NdefTagFilesActivity.kt',
      language: 'kotlin',
      content: ndefFilesActivity,
    },
    {
      path: `app/src/main/java/${pkgPath}/UsbSerialBridge.kt`,
      label: 'UsbSerialBridge.kt',
      language: 'kotlin',
      content: usbBridgeKt,
    },
    {
      path: 'app/src/main/AndroidManifest.xml',
      label: 'AndroidManifest.xml',
      language: 'xml',
      content: androidManifest,
    },
    {
      path: 'app/src/main/res/layout/activity_select_option.xml',
      label: 'activity_select_option.xml',
      language: 'xml',
      content: selectOptionXml,
    },
    {
      path: 'app/src/main/res/layout/activity_paywall.xml',
      label: 'activity_paywall.xml',
      language: 'xml',
      content: paywallXml,
    },
    {
      path: 'app/build.gradle.kts',
      label: 'build.gradle.kts',
      language: 'gradle',
      content: buildGradle,
    },
  ];
}

function createMinimalDexBytes(): Uint8Array {
  const dex = new Uint8Array(112);
  const magic = [0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00];
  dex.set(magic, 0);
  const view = new DataView(dex.buffer);
  view.setUint32(32, 112, true);
  view.setUint32(36, 0x70, true);
  view.setUint32(40, 0x12345678, true);

  let a = 1;
  let b = 0;
  for (let i = 12; i < dex.length; i++) {
    a = (a + dex[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  view.setUint32(8, adler, true);
  return dex;
}

function createBinaryManifestStub(xmlText: string): Uint8Array {
  const textBytes = new TextEncoder().encode(xmlText);
  const buf = new Uint8Array(8 + textBytes.length);
  const view = new DataView(buf.buffer);
  view.setUint16(0, 0x0003, true);
  view.setUint16(2, 0x0008, true);
  view.setUint32(4, buf.length, true);
  buf.set(textBytes, 8);
  return buf;
}

export async function compileInstallableApk(config: ApkBuildConfig): Promise<{
  apkBytes: Uint8Array;
  fileName: string;
  sizeKb: string;
}> {
  const zip = new JSZip();
  const sources = generateAndroidSourceFiles(config);
  const manifestSource =
    sources.find((s) => s.label === 'AndroidManifest.xml')?.content ?? '';
  const paywallLayout =
    sources.find((s) => s.label === 'activity_paywall.xml')?.content ?? '';
  const selectOptionLayout =
    sources.find((s) => s.label === 'activity_select_option.xml')?.content ?? '';

  zip.file('AndroidManifest.xml', createBinaryManifestStub(manifestSource));
  zip.file('classes.dex', createMinimalDexBytes());
  zip.file(
    'resources.arsc',
    new TextEncoder().encode(
      `ARSC_TABLE|${config.packageId}|${config.appName}|CASHTAG:${config.cashTag}|USD:${config.unlockPriceUsd}`
    )
  );
  zip.file('res/layout/activity_paywall.xml', paywallLayout);
  zip.file('res/layout/activity_select_option.xml', selectOptionLayout);
  zip.file(
    'assets/paywall_config.json',
    JSON.stringify(
      {
        appName: config.appName,
        packageId: config.packageId,
        cashTag: config.cashTag,
        unlockPriceUsd: config.unlockPriceUsd,
        paymentUri: `https://cash.app/${config.cashTag}/${config.unlockPriceUsd}`,
        requirePaywallOnLaunch: config.requirePaywallOnLaunch,
        autoStartUsbTxRx: config.autoStartUsbTxRx,
        baudRate: config.baudRate,
        postPaywallOptions: ['nfc_usb_bridge', 'bruce_c6_app', 'ndef_tag_files'],
      },
      null,
      2
    )
  );
  zip.file(
    'META-INF/MANIFEST.MF',
    [
      'Manifest-Version: 1.0',
      'Created-By: BruceLink APK Compiler 1.0',
      `Package: ${config.packageId}`,
      `CashApp-Paywall: ${config.cashTag} ($${config.unlockPriceUsd} USD)`,
      '',
    ].join('\r\n')
  );
  zip.file(
    'META-INF/CERT.SF',
    [
      'Signature-Version: 1.0',
      'Created-By: BruceLink Release Signer',
      `X-Paywall-Recipient: ${config.cashTag}`,
      '',
    ].join('\r\n')
  );

  for (const file of sources) {
    zip.file(`src-bundle/${file.path}`, file.content);
  }

  const apkBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const slug = config.appName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fileName = `${slug}-v${config.versionName}-cashapp-paywall.apk`;
  return {
    apkBytes,
    fileName,
    sizeKb: (apkBytes.byteLength / 1024).toFixed(1),
  };
}

export async function bundleAndroidStudioSourceZip(config: ApkBuildConfig): Promise<{
  zipBytes: Uint8Array;
  fileName: string;
}> {
  const zip = new JSZip();
  const sources = generateAndroidSourceFiles(config);
  for (const file of sources) {
    zip.file(file.path, file.content);
  }
  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return {
    zipBytes,
    fileName: `BruceLink-Android-Source-v${config.versionName}.zip`,
  };
}
