import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

interface EmailBodyRendererProps {
  body: string;
  bodyType: "html" | "plain";
  backgroundColor?: string;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
}

const INJECTED_JS = `
(function() {
  function reportHeight() {
    var h = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: h }));
  }
  reportHeight();
  window.addEventListener('load', reportHeight);
  var mo = new MutationObserver(reportHeight);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true });
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 800);
  setTimeout(reportHeight, 1500);
  setTimeout(reportHeight, 3000);
})();
true;
`;

function buildHtmlDoc(html: string, bg: string, text: string, muted: string, border: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=0.5, user-scalable=yes" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background-color: ${bg};
      color: ${text};
      font-family: -apple-system, 'Inter', 'SF Pro Text', system-ui, sans-serif;
      font-size: 15px;
      line-height: 1.65;
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
    }
    body {
      padding: 12px 12px 20px 12px;
    }
    .email-content-wrapper {
      max-width: 100%;
      overflow-x: hidden;
    }
    a {
      color: ${text} !important;
      text-decoration: underline;
      word-break: break-all;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
      display: block;
      border-radius: 4px;
    }
    table {
      max-width: 100% !important;
      width: 100% !important;
      table-layout: auto !important;
      word-break: break-word;
    }
    td, th {
      word-break: break-word;
      max-width: 100% !important;
    }
    * {
      -webkit-text-size-adjust: none !important;
    }
    pre, code {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      background: rgba(128,128,128,0.15);
      border-radius: 4px;
      padding: 2px 4px;
      color: ${text} !important;
    }
    pre {
      padding: 12px;
    }
    blockquote {
      margin: 8px 0;
      padding: 4px 12px;
      border-left: 3px solid ${border};
      color: ${muted} !important;
    }
    blockquote p, blockquote div, blockquote span {
      color: ${muted} !important;
    }
    hr {
      border: none;
      border-top: 1px solid ${border};
      margin: 12px 0;
    }
    *[width] {
      max-width: 100% !important;
    }
  </style>
  <script>
    function getLuminance(r, g, b) {
      var a = [r, g, b].map(function(v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }

    function parseColor(str) {
      if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
      var m = str.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    }

    function getEffectiveBg(el) {
      var node = el;
      while (node && node !== document.documentElement) {
        var c = parseColor(window.getComputedStyle(node).backgroundColor);
        if (c) return c;
        node = node.parentElement;
      }
      return [255, 255, 255]; // default to white
    }

    function fixContrast() {
      var appText = '${text}';
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (!el.childNodes.length) continue;
        var hasTextNode = false;
        for (var j = 0; j < el.childNodes.length; j++) {
          if (el.childNodes[j].nodeType === 3 && el.childNodes[j].textContent.trim()) {
            hasTextNode = true; break;
          }
        }
        if (!hasTextNode) continue;

        var computed = window.getComputedStyle(el);
        var textColor = parseColor(computed.color);
        if (!textColor) continue;

        var bgColor = getEffectiveBg(el);
        var textLum = getLuminance(textColor[0], textColor[1], textColor[2]);
        var bgLum = getLuminance(bgColor[0], bgColor[1], bgColor[2]);
        var brighter = Math.max(textLum, bgLum);
        var darker = Math.min(textLum, bgLum);
        var ratio = (brighter + 0.05) / (darker + 0.05);

        if (ratio < 2.5) {
          // Low contrast — force text to app foreground color if background is light
          if (bgLum > 0.4) {
            el.style.setProperty('color', appText, 'important');
          } else {
            el.style.setProperty('color', '#ffffff', 'important');
          }
        }
      }
    }

    function boostSmallFonts() {
      var all = document.querySelectorAll('[style]');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var style = el.getAttribute('style') || '';
        var match = style.match(/font-size:\\s*(\\d+(?:\\.\\d+)?)(px|pt)/i);
        if (match) {
          var size = parseFloat(match[1]);
          var unit = match[2].toLowerCase();
          var px = unit === 'pt' ? size * 1.333 : size;
          if (px < 12) el.style.fontSize = '12px';
        }
      }
    }

    document.addEventListener('DOMContentLoaded', function() {
      boostSmallFonts();
      fixContrast();
      // Run again after images/fonts load in case layout shifts
      setTimeout(fixContrast, 600);
      setTimeout(fixContrast, 1800);
    });
  </script>
</head>
<body><div class="email-content-wrapper">${html}</div></body>
</html>`;
}

export function EmailBodyRenderer({
  body,
  bodyType,
  backgroundColor = "#ffffff",
  textColor = "#0a0a0a",
  mutedColor = "#737373",
  borderColor = "#e5e5e5",
}: EmailBodyRendererProps) {
  const [webViewHeight, setWebViewHeight] = useState(200);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data) as { type: string; height: number };
      if (data.type === "height" && data.height > 0) {
        setWebViewHeight(Math.max(data.height, 200));
      }
    } catch {}
  }, []);

  if (bodyType === "html" && body.trim()) {
    const htmlDoc = buildHtmlDoc(body, backgroundColor, textColor, mutedColor, borderColor);

    return (
      <View style={{ height: webViewHeight, width: "100%" }}>
        <WebView
          source={{ html: htmlDoc }}
          style={{ flex: 1, backgroundColor: "transparent" }}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          injectedJavaScript={INJECTED_JS}
          onMessage={onMessage}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled={false}
          allowsInlineMediaPlayback={false}
          mediaPlaybackRequiresUserAction
          scalesPageToFit={false}
          onShouldStartLoadWithRequest={(req) => {
            if (req.navigationType === "click") return false;
            return req.url === "about:blank" || req.url.startsWith("data:");
          }}
        />
      </View>
    );
  }

  // Plain text rendering
  const lines = (body || "").trim().split("\n");
  return (
    <View style={[styles.plainContainer, { backgroundColor }]}>
      {lines.map((line, i) => {
        const isQuote = line.startsWith(">");
        const isBlank = line.trim() === "";
        if (isBlank) {
          return <View key={i} style={styles.blankLine} />;
        }
        return (
          <Text
            key={i}
            style={[
              styles.plainLine,
              { color: isQuote ? mutedColor : textColor },
              isQuote && [styles.quotedLine, { borderLeftColor: borderColor }],
            ]}
          >
            {isQuote ? line.replace(/^>+\s?/, "") : line}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  plainContainer: {
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  plainLine: {
    fontSize: 15,
    lineHeight: 24,
    fontFamily: Platform.select({ ios: "Inter_400Regular", android: "Inter_400Regular", default: "system-ui" }),
  },
  quotedLine: {
    paddingLeft: 12,
    borderLeftWidth: 3,
    opacity: 0.6,
  },
  blankLine: {
    height: 6,
  },
});
