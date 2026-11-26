package nl.endless.klankstroom;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.RandomAccessFile;
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
            if (path.startsWith("/m")) { meta(out); return; }
            if (path.startsWith("/f")) { file(out, method, path, range); return; }
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
                c.setRequestProperty("Icy-MetaData", "1");
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
            int metaint = 0;
            try { metaint = Integer.parseInt(String.valueOf(c.getHeaderField("icy-metaint")).trim()); } catch (Exception ignored) {}
            String icyName = c.getHeaderField("icy-name");
            synchronized (StreamProxy.class) { metaUrl = target; metaTitle = ""; metaName = icyName == null ? "" : icyName; }
            byte[] buf = new byte[16384];
            int n;
            if (metaint <= 0) {
                while ((n = up.read(buf)) != -1) { out.write(buf, 0, n); }
            } else {
                // ICY: titel van het nummer uit de stream halen en de metadata-blokken eruit filteren
                int left = metaint;
                while (true) {
                    n = up.read(buf, 0, Math.min(buf.length, left));
                    if (n == -1) break;
                    out.write(buf, 0, n);
                    left -= n;
                    if (left == 0) {
                        int lb = up.read();
                        if (lb < 0) break;
                        int ml = lb * 16;
                        if (ml > 0) {
                            byte[] m = new byte[ml];
                            int got = 0;
                            while (got < ml) { int r = up.read(m, got, ml - got); if (r < 0) break; got += r; }
                            String s = new String(m, 0, got, StandardCharsets.UTF_8);
                            int a = s.indexOf("StreamTitle='");
                            if (a >= 0) {
                                int b = s.indexOf("';", a + 13);
                                String t = b > a ? s.substring(a + 13, b) : s.substring(a + 13);
                                synchronized (StreamProxy.class) { if (target.equals(metaUrl)) metaTitle = t.trim(); }
                            }
                        }
                        left = metaint;
                    }
                }
            }
            out.flush();
        } catch (Exception e) {
            /* speler sluit verbinding (pauze/volgende zender) of stream valt weg */
        } finally {
            if (c != null) c.disconnect();
            try { sock.close(); } catch (IOException ignored) {}
        }
    }

    // laatst bekende nummertitel van de stream die nu doorgegeven wordt
    private static String metaUrl = "", metaTitle = "", metaName = "";

    private static String js(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : (s == null ? "" : s).toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\').append(ch);
            else if (ch < 32) b.append(' ');
            else b.append(ch);
        }
        return b.append('"').toString();
    }

    private static void meta(OutputStream out) throws IOException {
        String body;
        synchronized (StreamProxy.class) { body = "{\"u\":" + js(metaUrl) + ",\"title\":" + js(metaTitle) + ",\"name\":" + js(metaName) + "}"; }
        byte[] b = body.getBytes(StandardCharsets.UTF_8);
        out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nContent-Length: "
            + b.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.write(b);
    }

    /** lokaal bestand (SD-kaart/USB) met Range-ondersteuning: goed doorspoelen, nette 'einde', echte analyse */
    private static void file(OutputStream out, String method, String path, String range) throws IOException {
        int q = path.indexOf("p=");
        if (q < 0) { error(out, 400); return; }
        File f = new File(URLDecoder.decode(path.substring(q + 2).split("&")[0], "UTF-8"));
        if (!f.isFile() || !f.canRead()) { error(out, 404); return; }
        long size = f.length(), start = 0, end = size - 1;
        boolean part = false;
        if (range != null && range.startsWith("bytes=")) {
            try {
                String[] r = range.substring(6).split(",")[0].split("-", -1);
                if (!r[0].isEmpty()) { start = Long.parseLong(r[0].trim()); if (r.length > 1 && !r[1].trim().isEmpty()) end = Long.parseLong(r[1].trim()); }
                else if (r.length > 1) { start = Math.max(0, size - Long.parseLong(r[1].trim())); }
                part = true;
            } catch (Exception ignored) { start = 0; end = size - 1; part = false; }
        }
        if (end >= size) end = size - 1;
        if (start > end) {
            out.write(("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + size + "\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
            return;
        }
        String n = f.getName().toLowerCase();
        String type = n.endsWith(".mp3") ? "audio/mpeg" : n.endsWith(".flac") ? "audio/flac" : n.endsWith(".ogg") || n.endsWith(".oga") ? "audio/ogg"
            : n.endsWith(".opus") ? "audio/ogg" : n.endsWith(".wav") ? "audio/wav" : n.endsWith(".m4a") || n.endsWith(".aac") || n.endsWith(".mp4") ? "audio/mp4"
            : n.endsWith(".wma") ? "audio/x-ms-wma" : "application/octet-stream";
        long len = end - start + 1;
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(part ? "206 Partial Content" : "200 OK").append("\r\n");
        h.append("Content-Type: ").append(type).append("\r\nAccess-Control-Allow-Origin: *\r\nAccept-Ranges: bytes\r\n");
        h.append("Content-Length: ").append(len).append("\r\n");
        if (part) h.append("Content-Range: bytes ").append(start).append('-').append(end).append('/').append(size).append("\r\n");
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
        if ("HEAD".equals(method)) return;
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            raf.seek(start);
            byte[] buf = new byte[65536];
            long left = len;
            while (left > 0) {
                int r = raf.read(buf, 0, (int) Math.min(buf.length, left));
                if (r < 0) break;
                out.write(buf, 0, r);
                left -= r;
            }
        }
        out.flush();
    }

    private static void error(OutputStream out, int code) throws IOException {
        out.write(("HTTP/1.1 " + code + " Error\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .getBytes(StandardCharsets.ISO_8859_1));
    }
}
