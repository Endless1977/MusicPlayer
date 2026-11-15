package nl.endless.klankstroom;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/**
 * Klankstroom — kleine doorgeefserver op 127.0.0.1.
 * Radiostreams sturen meestal geen CORS-headers, waardoor de WebView het geluid niet mag analyseren
 * (de visualizer zou dan niet op de muziek reageren). Deze server haalt de stream op en geeft hem
 * door mét "Access-Control-Allow-Origin: *". Alleen bereikbaar vanaf de telefoon zelf.
 */
public class StreamProxy implements Runnable {
    private ServerSocket server;
    private int port = 0;

    public synchronized int start() {
        if (server != null && !server.isClosed()) return port;
        try {
            server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
            port = server.getLocalPort();
            Thread t = new Thread(this, "klankstroom-proxy");
            t.setDaemon(true);
            t.start();
        } catch (IOException e) { port = 0; }
        return port;
    }

    @Override
    public void run() {
        while (server != null && !server.isClosed()) {
            try {
                final Socket s = server.accept();
                Thread t = new Thread(() -> handle(s), "klankstroom-proxy-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) { /* doorgaan */ }
        }
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int prev3 = 0, prev2 = 0, prev1 = 0, b;
        while ((b = in.read()) != -1) {
            buf.write(b);
            if (prev3 == '\r' && prev2 == '\n' && prev1 == '\r' && b == '\n') break;
            prev3 = prev2; prev2 = prev1; prev1 = b;
            if (buf.size() > 16384) break;
        }
        return buf.toString("ISO-8859-1");
    }

    private void handle(Socket sock) {
        HttpURLConnection c = null;
        try {
            sock.setSoTimeout(30000);
            InputStream in = sock.getInputStream();
            OutputStream out = sock.getOutputStream();
            String head = readHead(in);
            String[] lines = head.split("\r\n");
            if (lines.length == 0) return;
            String[] req = lines[0].split(" ");
            if (req.length < 2) return;
            String method = req[0];
            String range = null;
            for (String l : lines) if (l.toLowerCase().startsWith("range:")) range = l.substring(6).trim();

            if ("OPTIONS".equals(method)) {
                out.write(("HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\n" +
                    "Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
                return;
            }
            String path = req[1];
            int q = path.indexOf("u=");
            if (q < 0) { error(out, 400); return; }
            String target = URLDecoder.decode(path.substring(q + 2).split("&")[0], "UTF-8");
            if (!target.startsWith("http://") && !target.startsWith("https://")) { error(out, 400); return; }

            // verbinden, redirects (ook http→https) zelf volgen
            URL url = new URL(target);
            int code = 0;
            for (int hop = 0; hop < 6; hop++) {
                c = (HttpURLConnection) url.openConnection();
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(12000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", "Klankstroom/1.0 (Android)");
                c.setRequestProperty("Icy-MetaData", "0");
                c.setRequestProperty("Accept", "*/*");
                if (range != null) c.setRequestProperty("Range", range);
                code = c.getResponseCode();
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                    url = new URL(url, c.getHeaderField("Location"));
                    c.disconnect();
                    continue;
                }
                break;
            }
            if (code >= 400 || code <= 0) { error(out, code > 0 ? code : 502); return; }

            String type = c.getContentType();
            if (type == null || type.startsWith("text/html")) type = "audio/mpeg";
            long len = c.getContentLengthLong();
            StringBuilder h = new StringBuilder();
            h.append("HTTP/1.1 ").append(code == 206 ? "206 Partial Content" : "200 OK").append("\r\n");
            h.append("Content-Type: ").append(type).append("\r\n");
            h.append("Access-Control-Allow-Origin: *\r\n");
            h.append("Access-Control-Expose-Headers: *\r\n");
            h.append("Cache-Control: no-cache\r\n");
            if (len >= 0) h.append("Content-Length: ").append(len).append("\r\n");
            String cr = c.getHeaderField("Content-Range");
            if (cr != null) h.append("Content-Range: ").append(cr).append("\r\n");
            if (c.getHeaderField("Accept-Ranges") != null) h.append("Accept-Ranges: ").append(c.getHeaderField("Accept-Ranges")).append("\r\n");
            h.append("Connection: close\r\n\r\n");
            out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
            if ("HEAD".equals(method)) return;

            InputStream up = c.getInputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = up.read(buf)) != -1) { out.write(buf, 0, n); }
            out.flush();
        } catch (Exception e) {
            /* speler sluit verbinding (pauze/volgende zender) of stream valt weg */
        } finally {
            if (c != null) c.disconnect();
            try { sock.close(); } catch (IOException ignored) {}
        }
    }

    private static void error(OutputStream out, int code) throws IOException {
        out.write(("HTTP/1.1 " + code + " Error\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .getBytes(StandardCharsets.ISO_8859_1));
    }
}
