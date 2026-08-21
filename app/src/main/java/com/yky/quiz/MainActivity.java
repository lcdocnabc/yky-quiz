package com.yky.quiz;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileWriter;

/**
 * 纯 WebView 壳：加载内置的 H5 题库 App（assets/public/index.html）。
 * 完全离线运行，不申请任何网络权限。
 */
public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);          // 开启 localStorage（题库/进度持久化）
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);

        webView.addJavascriptInterface(new JSBridge(), "Android");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            // 手机端“导入CSV”：响应 <input type="file">，打开系统文件选择器
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                uploadCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), 100);
                } catch (Exception e) {
                    uploadCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/public/index.html");
    }

    // H5 调用的原生桥：导出 CSV 写入本机存储（应用私有目录，无需联网/权限）
    private class JSBridge {
        @android.webkit.JavascriptInterface
        public void saveCsv(String name, String content) {
            try {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getExternalFilesDir(null);
                File f = new File(dir, name);
                try (FileWriter w = new FileWriter(f)) { w.write(content); }
                final String path = f.getAbsolutePath();
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "已导出到：" + path, Toast.LENGTH_LONG).show());
            } catch (Exception e) {
                final String msg = e.getMessage();
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "导出失败：" + msg, Toast.LENGTH_LONG).show());
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 100) {
            if (uploadCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                Uri uri = data.getData();
                if (uri != null) results = new Uri[]{uri};
            }
            uploadCallback.onReceiveValue(results);
            uploadCallback = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
