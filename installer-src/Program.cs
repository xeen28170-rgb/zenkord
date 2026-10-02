using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Drawing;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

namespace ZenkordInstaller
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new LauncherForm());
        }
    }

    public class LauncherForm : Form
    {
        private WebView2 _webView;
        private ZenkordBackend _backend;

        public LauncherForm()
        {
            this.Text = "Zenkord Installer";
            this.Size = new Size(740, 620); // Enlarged to prevent text clipping
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(11, 11, 24); // matching HTML root
            var iconStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZenkordInstaller.icon.ico");
            if (iconStream != null) this.Icon = new Icon(iconStream);

            _webView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.Transparent
            };
            this.Controls.Add(_webView);

            // Drag window from HTML
            _webView.NavigationCompleted += (s, e) => {
                _webView.CoreWebView2.WebMessageReceived += (sender, args) => {
                    if (args.TryGetWebMessageAsString() == "drag") {
                        ReleaseCapture();
                        SendMessage(this.Handle, 0xA1, 0x2, 0);
                    }
                };
            };

            InitializeWebView();
        }

        [DllImport("user32.dll")]
        public static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
        [DllImport("user32.dll")]
        public static extern bool ReleaseCapture();

        private async void InitializeWebView()
        {
            var userDataFolder = Path.Combine(Path.GetTempPath(), "ZenkordInstaller_WebView2");
            CoreWebView2Environment env;
            try
            {
                env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await _webView.EnsureCoreWebView2Async(env);
            }
            catch (Exception ex)
            {
                bool isWebView2Missing = ex is System.Runtime.InteropServices.COMException ||
                                         ex.HResult == unchecked((int)0x80070002) ||
                                         ex.Message.IndexOf("webview2", StringComparison.OrdinalIgnoreCase) >= 0 ||
                                         ex.Message.Contains("0x80070002") ||
                                         ex.GetType().Name.Contains("WebView2");

                if (isWebView2Missing)
                {
                    MessageBox.Show(
                        "Microsoft Edge WebView2 Runtime is required to run the Zenkord Installer but was not found on your system.\n\n" +
                        "Please download and install it from:\nhttps://aka.ms/webview2\n\n" +
                        "After installing, restart the Zenkord Installer.",
                        "WebView2 Runtime Required",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
                else
                {
                    MessageBox.Show(
                        "Failed to initialize the installer GUI:\n\n" + ex.Message + "\n\n" +
                        "Please ensure the Microsoft Edge WebView2 Runtime is installed.\n" +
                        "You can download it from:\nhttps://aka.ms/webview2",
                        "Initialization Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                }
                Application.Exit();
                return;
            }

            _backend = new ZenkordBackend(this, _webView);
            _webView.CoreWebView2.AddHostObjectToScript("backend", _backend);

            // Wrap COM proxy into exactly what index.html expects, and add drag support
            await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(@"
                window.zenkord = {
                    detectDiscord: async () => JSON.parse(await chrome.webview.hostObjects.backend.DetectDiscord()),
                    isInjected: async (path) => await chrome.webview.hostObjects.backend.IsInjected(path),
                    hasThirdPartyMod: async (path) => await chrome.webview.hostObjects.backend.HasThirdPartyMod(path),
                    inject: async (path) => JSON.parse(await chrome.webview.hostObjects.backend.Inject(path)),
                    startInject: (path) => JSON.parse(chrome.webview.hostObjects.sync.backend.StartInject(path)),
                    getInjectStatus: () => JSON.parse(chrome.webview.hostObjects.sync.backend.GetInjectStatus()),
                    uninject: async (path) => JSON.parse(await chrome.webview.hostObjects.backend.Uninject(path)),
                    minimizeApp: () => chrome.webview.hostObjects.backend.MinimizeApp(),
                    closeApp: () => chrome.webview.hostObjects.backend.CloseApp(),
                    openUrl: (url) => chrome.webview.hostObjects.backend.OpenUrl(url),
                    getInstallerSettings: () => ({}),
                    setInstallerSettings: () => ({})
                };

                // Add drag support to titlebar
                document.addEventListener('DOMContentLoaded', () => {
                    const titlebar = document.querySelector('.titlebar');
                    if (titlebar) {
                        titlebar.addEventListener('mousedown', (e) => {
                            if(e.target.tagName !== 'BUTTON' && !e.target.classList.contains('titlebar-title')) {
                                window.chrome.webview.postMessage('drag');
                            }
                        });
                    }
                });
            ");

            // Disable context menu and dev tools
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

            // Load HTML from embedded resource and inject Icon
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZenkordInstaller.index.html"))
            using (var reader = new StreamReader(stream))
            {
                var html = reader.ReadToEnd();

                // Convert Icon to Base64 PNG for HTML
                try {
                    using (var iconStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ZenkordInstaller.icon.ico"))
                    {
                        var icon = new Icon(iconStream);
                        using (var bmp = icon.ToBitmap())
                        using (var ms = new MemoryStream())
                        {
                            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                            var base64 = Convert.ToBase64String(ms.ToArray());
                            html = html.Replace("{{ICON_BASE64}}", "data:image/png;base64," + base64);
                        }
                    }
                } catch { }

                _webView.NavigateToString(html);
            }
        }
    }

    [ComVisible(true)]
    public class ZenkordBackend
    {
        private LauncherForm _form;
        private WebView2 _webView;
        private HttpClient _http;
        private string _distDir;
        private string _exeDir;

        const string GITEA_REPO = "xeen28170-rgb/zenkord";
        const string GITEA_URL  = "https://api.github.com/repos";
        const string DIST_ZIP   = "zenkord-dist.zip";

        public ZenkordBackend(LauncherForm form, WebView2 webView)
        {
            _form = form;
            _webView = webView;
            _http = new HttpClient();
            _http.Timeout = TimeSpan.FromSeconds(120); // 2 min — zenkord-dist.zip is ~26MB
            _exeDir = Path.GetDirectoryName(Application.ExecutablePath);
            _distDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zenkord", "dist");
        }

        public void MinimizeApp() { _form.Invoke(new Action(() => _form.WindowState = FormWindowState.Minimized)); }
        public void CloseApp() { _form.Invoke(new Action(() => Application.Exit())); }
        public void OpenUrl(string url)
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        public void SetStatus(string type, string text)
        {
            _form.Invoke(new Action(() => {
                var safeText = text.Replace("'", "\\'").Replace("\n", " ");
                _webView.CoreWebView2.ExecuteScriptAsync($"if(typeof setStatus === 'function') setStatus('{type}', '{safeText}');");
            }));
        }

        public void SetProgress(double percent, string text, double mbDownloaded = -1, double mbTotal = -1)
        {
            _form.Invoke(new Action(() => {
                var safeText = text.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\n", " ");
                var percentStr = percent.ToString("F1", System.Globalization.CultureInfo.InvariantCulture);
                if (mbDownloaded >= 0 && mbTotal >= 0)
                {
                    var mbDlStr    = mbDownloaded.ToString("F1", System.Globalization.CultureInfo.InvariantCulture);
                    var mbTotalStr = mbTotal.ToString("F1", System.Globalization.CultureInfo.InvariantCulture);
                    _webView.CoreWebView2.ExecuteScriptAsync($"if(typeof setLoading === 'function') setLoading(true, '{safeText}', {percentStr}, {mbDlStr}, {mbTotalStr});");
                }
                else
                {
                    _webView.CoreWebView2.ExecuteScriptAsync($"if(typeof setLoading === 'function') setLoading(true, '{safeText}', {percentStr});");
                }
            }));
        }

        public async Task<bool> IsInjected(string path)
        {
            return await Task.Run(() => {
                var appDir = System.IO.Path.Combine(path, "app");
                var pkgPath = System.IO.Path.Combine(appDir, "package.json");
                if (Directory.Exists(appDir) && File.Exists(pkgPath) && File.ReadAllText(pkgPath).Contains("\"zenkord\"")) return true;

                // Réinjection automatique après une mise à jour de Discord (patchWin32Updater) :
                // app.asar est alors un dossier dont index.js charge Zenkord.
                var repatchIndex = System.IO.Path.Combine(path, "app.asar", "index.js");
                return File.Exists(repatchIndex) && File.ReadAllText(repatchIndex).Contains("Zenkord", StringComparison.OrdinalIgnoreCase);
            });
        }

        /// <summary>
        /// Returns true if a third-party mod (Vencord, Equicord, OpenAsar) is detected
        /// but Zenkord is NOT yet injected.
        /// </summary>
        public async Task<bool> HasThirdPartyMod(string path)
        {
            return await Task.Run(() => {
                var appDir = System.IO.Path.Combine(path, "app");
                var pkgPath = System.IO.Path.Combine(appDir, "package.json");
                if (!Directory.Exists(appDir) || !File.Exists(pkgPath)) return false;
                var content = File.ReadAllText(pkgPath);
                // Already Zenkord → not a third-party mod
                if (content.Contains("\"zenkord\"")) return false;
                return content.Contains("vencord", StringComparison.OrdinalIgnoreCase)
                    || content.Contains("equicord", StringComparison.OrdinalIgnoreCase)
                    || content.Contains("openasar", StringComparison.OrdinalIgnoreCase);
            });
        }

        public async Task<string> DetectDiscord()
        {
            return await Task.Run(() => {
                var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string[] channels = { "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment" };
                string[] names = { "Discord", "Discord PTB", "Discord Canary", "Discord Dev" };

                var list = new List<object>();
                for (int i = 0; i < channels.Length; i++)
                {
                    var c = channels[i];
                    var dPath = Path.Combine(localAppData, c);
                    if (!Directory.Exists(dPath)) continue;

                    foreach (var dir in Directory.GetDirectories(dPath, "app-*"))
                    {
                        var resources = Path.Combine(dir, "resources");
                        if (!Directory.Exists(resources)) continue;

                        list.Add(new {
                            name = names[i],
                            path = resources,
                            asarPath = Path.Combine(resources, "app.asar"),
                            version = Path.GetFileName(dir).Replace("app-", "")
                        });
                    }
                }
                return JsonSerializer.Serialize(list);
            });
        }

        // Job state for async inject (avoids WebView2 COM proxy timeout on large downloads)
        private string _injectJobState = "idle"; // idle | running | done | error
        private string _injectJobError = "";

        public string StartInject(string resourcesPath)
        {
            if (_injectJobState == "running")
                return JsonSerializer.Serialize(new { started = false, error = "Already running" });

            _injectJobState = "running";
            _injectJobError = "";

            Task.Run(async () =>
            {
                try
                {
                    await EnsureDistAsync();
                    await Task.Run(() => DoInject(resourcesPath));
                    _injectJobState = "done";
                }
                catch (Exception ex)
                {
                    _injectJobError = ex.Message;
                    _injectJobState = "error";
                }
            });

            return JsonSerializer.Serialize(new { started = true });
        }

        public string GetInjectStatus()
        {
            return JsonSerializer.Serialize(new
            {
                state = _injectJobState,
                error = _injectJobError
            });
        }

        // Keep old Inject for compat but it just delegates
        public async Task<string> Inject(string resourcesPath)
        {
            try {
                await EnsureDistAsync();
                await Task.Run(() => DoInject(resourcesPath));
                return JsonSerializer.Serialize(new { success = true });
            } catch (Exception ex) {
                return JsonSerializer.Serialize(new { success = false, error = ex.Message });
            }
        }

        public async Task<string> Uninject(string resourcesPath)
        {
            try {
                await Task.Run(() => DoUninject(resourcesPath));
                return JsonSerializer.Serialize(new { success = true });
            } catch (Exception ex) {
                return JsonSerializer.Serialize(new { success = false, error = ex.Message });
            }
        }

        private async Task EnsureDistAsync()
        {
            var localDist = Path.Combine(_exeDir, "dist");
            if (Directory.Exists(localDist) && File.Exists(Path.Combine(localDist, "patcher.js")))
            {
                _distDir = localDist;
                SetStatus("loading", "Files found locally...");
                return;
            }

            SetProgress(2, "Fetching latest release information...");
            Directory.CreateDirectory(Path.GetDirectoryName(_distDir));

            var apiUrl = $"{GITEA_URL}/{GITEA_REPO}/releases/latest";
            _http.DefaultRequestHeaders.Clear();
            _http.DefaultRequestHeaders.Add("User-Agent", "Zenkord-Installer/2.0");
            _http.DefaultRequestHeaders.Add("Accept", "application/json");

            string json;
            try
            {
                json = await _http.GetStringAsync(apiUrl);
            }
            catch (TaskCanceledException)
            {
                throw new Exception("GitHub API timed out (30s). Check your internet connection and try again.");
            }
            catch (HttpRequestException ex)
            {
                throw new Exception($"Could not reach GitHub API: {ex.Message}. Check your internet connection.");
            }

            var zipUrl = ExtractJsonValue(json, "browser_download_url", DIST_ZIP);

            if (string.IsNullOrEmpty(zipUrl))
                throw new Exception($"'{DIST_ZIP}' not found in the GitHub release. The release may not be published yet.");

            SetProgress(5, "Starting download...");
            var tmpZip = Path.Combine(Path.GetTempPath(), "zenkord-dist.zip");

            using (var response = await _http.GetAsync(zipUrl, HttpCompletionOption.ResponseHeadersRead))
            {
                response.EnsureSuccessStatusCode();
                var totalBytes = response.Content.Headers.ContentLength ?? (long)(348.0 * 1024 * 1024);

                using (var contentStream = await response.Content.ReadAsStreamAsync())
                using (var fs = new FileStream(tmpZip, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
                {
                    var buffer = new byte[81920];
                    long totalRead = 0;
                    int read;
                    double lastReportedPercent = 0;

                    while ((read = await contentStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    {
                        await fs.WriteAsync(buffer, 0, read);
                        totalRead += read;

                        double percent = (double)totalRead / totalBytes * 100.0;
                        if (percent - lastReportedPercent >= 0.5 || percent >= 100.0)
                        {
                            lastReportedPercent = percent;
                            double overallPercent = 5.0 + (percent * 0.70);
                            double totalMB = (double)totalBytes / (1024.0 * 1024.0);
                            double readMB  = (double)totalRead  / (1024.0 * 1024.0);
                            SetProgress(overallPercent, "Downloading Zenkord...", readMB, totalMB);
                        }
                    }
                }
            }

            // SHA-256 verification before extraction
            SetProgress(76, "Verifying download integrity...");
            var expectedHash = await DownloadChecksumAsync(zipUrl);
            if (!string.IsNullOrEmpty(expectedHash))
            {
                var actualHash = ComputeSha256(tmpZip);
                if (!string.Equals(actualHash, expectedHash, StringComparison.OrdinalIgnoreCase))
                {
                    try { File.Delete(tmpZip); } catch { }
                    throw new Exception(
                        $"SHA-256 mismatch! The downloaded file may be corrupted or tampered with.\n" +
                        $"Expected: {expectedHash}\nActual:   {actualHash}\n\n" +
                        $"Download aborted for your safety. Please try again or report this issue."
                    );
                }
                SetProgress(77, "Checksum verified successfully.");
            }
            else
            {
                try { File.Delete(tmpZip); } catch { }
                throw new Exception("Could not verify the download (update-manifest.json missing or invalid). Installation aborted for your safety.");
            }

            SetProgress(78, "Preparing extraction...");
            await Task.Run(() =>
            {
                if (Directory.Exists(_distDir)) Directory.Delete(_distDir, true);
                Directory.CreateDirectory(_distDir);

                var normalizedDistDir = _distDir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                                + Path.DirectorySeparatorChar;

                using (var archive = ZipFile.OpenRead(tmpZip))
                {
                    int totalEntries = archive.Entries.Count;
                    int extractedEntries = 0;
                    double lastReportedPercent = 0;

                    foreach (var entry in archive.Entries)
                    {
                        var entryPath = entry.FullName
                            .Replace('/', Path.DirectorySeparatorChar)
                            .TrimStart(Path.DirectorySeparatorChar);

                        if (entryPath.Contains(".."))
                            continue;

                        var fullPath = Path.GetFullPath(Path.Combine(_distDir, entryPath));

                        if (!fullPath.StartsWith(normalizedDistDir, StringComparison.OrdinalIgnoreCase))
                            continue;

                        if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        {
                            Directory.CreateDirectory(fullPath);
                        }
                        else
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
                            entry.ExtractToFile(fullPath, true);
                        }

                        extractedEntries++;
                        double percent = (double)extractedEntries / totalEntries * 100.0;
                        if (percent - lastReportedPercent >= 1.0 || percent >= 100.0)
                        {
                            lastReportedPercent = percent;
                            double overallPercent = 78.0 + (percent * 0.14);
                            SetProgress(overallPercent, $"Extracting files ({extractedEntries}/{totalEntries})...");
                        }
                    }
                }

                try { File.Delete(tmpZip); } catch { }
            });
        }

        private void DoInject(string resPath)
        {
            var appDir = Path.Combine(resPath, "app");
            var backup = Path.Combine(resPath, "_app.asar");
            var appAsar = Path.Combine(resPath, "app.asar");

            // Check for third-party mod and ask user before proceeding
            var hasOtherMod = false;
            if (Directory.Exists(appDir))
            {
                var pkgFile = Path.Combine(appDir, "package.json");
                if (File.Exists(pkgFile))
                {
                    var pkgContent = File.ReadAllText(pkgFile);
                    hasOtherMod = !pkgContent.Contains("\"zenkord\"") &&
                        (pkgContent.Contains("vencord", StringComparison.OrdinalIgnoreCase) ||
                         pkgContent.Contains("equicord", StringComparison.OrdinalIgnoreCase) ||
                         pkgContent.Contains("openasar", StringComparison.OrdinalIgnoreCase));
                }
            }

            if (hasOtherMod)
            {
                var result = MessageBox.Show(
                    "A different client mod (Vencord/Equicord/OpenAsar) is already installed.\n\n" +
                    "Click Yes to replace it with Zenkord (the other mod will be removed).\n" +
                    "Click No to cancel and keep the current mod.",
                    "Third-Party Mod Detected",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
                );

                if (result == DialogResult.No)
                {
                    throw new Exception("Installation cancelled by user — another mod was detected.");
                }
            }

            SetProgress(90, "Closing Discord...");
            KillDiscord(resPath);

            SetProgress(91, "Removing previous injection...");
            if (Directory.Exists(appDir))
            {
                try { Directory.Delete(appDir, true); } catch { }
            }

            // app.asar peut être un dossier (réinjection automatique après une mise à jour de Discord) :
            // on le retire, le vrai Discord est restauré depuis _app.asar juste après.
            if (Directory.Exists(appAsar))
            {
                Directory.Delete(appAsar, true);
            }

            if (File.Exists(appAsar) && new FileInfo(appAsar).Length < 2_000_000)
            {
                File.Delete(appAsar);
            }

            string[] thirdPartyBackups = { "_app.asar", "original_app.asar", "app.asar.bak" };
            foreach (var bkName in thirdPartyBackups)
            {
                var bkPath = Path.Combine(resPath, bkName);
                if (File.Exists(bkPath) && new FileInfo(bkPath).Length > 2_000_000)
                {
                    if (!File.Exists(appAsar) || new FileInfo(appAsar).Length < 2_000_000)
                    {
                        if (File.Exists(appAsar)) File.Delete(appAsar);
                        File.Copy(bkPath, appAsar);
                    }
                    break;
                }
            }

            CleanModulePatches(resPath);

            SetProgress(92, "Configuring Zenkord loader...");

            if (!File.Exists(appAsar) && !File.Exists(backup))
            {
                throw new Exception(
                    "Critical error: no valid app.asar found. " +
                    "Please reinstall Discord from discord.com/download and try again."
                );
            }

            if (File.Exists(appAsar))
            {
                bool renamed = false;
                Exception lastEx = null;
                for (int i = 0; i < 5; i++)
                {
                    try
                    {
                        if (File.Exists(backup)) File.Delete(backup);
                        File.Move(appAsar, backup);
                        renamed = true;
                        break;
                    }
                    catch (IOException ex)
                    {
                        lastEx = ex;
                        System.Threading.Thread.Sleep(1000);
                    }
                    catch (UnauthorizedAccessException ex)
                    {
                        lastEx = ex;
                        System.Threading.Thread.Sleep(1000);
                    }
                }
                if (!renamed)
                {
                    throw new Exception("File is locked by another process after multiple attempts. Please close Discord manually via Task Manager. Details: " + lastEx.Message);
                }
            }

            SetProgress(94, "Creating app directory...");
            Directory.CreateDirectory(appDir);
            WriteLoader(appDir);
            CopyAssetsToDiscord(resPath);
            SetProgress(99, "Starting Discord...");
            StartDiscord(resPath);
        }

        private void CleanModulePatches(string resPath)
        {
            try
            {
                var appBase = Path.GetDirectoryName(resPath);

                string[] modulesSearchPaths = {
                    Path.Combine(appBase, "modules"),
                    Path.Combine(resPath, "modules")
                };

                foreach (var modulesDir in modulesSearchPaths)
                {
                    if (!Directory.Exists(modulesDir)) continue;

                    foreach (var coreParent in Directory.GetDirectories(modulesDir, "discord_desktop_core*"))
                    {
                        var corePath = Path.Combine(coreParent, "discord_desktop_core");
                        if (!Directory.Exists(corePath)) continue;

                        string[] patchedFiles = {
                            Path.Combine(corePath, "index.js"),
                            Path.Combine(corePath, "app", "app_bootstrap", "splashScreen.js"),
                            Path.Combine(corePath, "app", "app_bootstrap", "index.js"),
                        };

                        foreach (var pf in patchedFiles)
                        {
                            if (!File.Exists(pf)) continue;
                            var content = File.ReadAllText(pf);

                            // Only remove Zenkord/Equilotl patches — leave other mods alone
                            bool isZenkordPatch = content.Contains("equilotl", StringComparison.OrdinalIgnoreCase);

                            if (!isZenkordPatch) continue;

                            string[] backupExts = { ".orig", ".bak", ".vanilla" };
                            bool restored = false;
                            foreach (var ext in backupExts)
                            {
                                var bk = pf + ext;
                                if (File.Exists(bk))
                                {
                                    File.Copy(bk, pf, true);
                                    File.Delete(bk);
                                    restored = true;
                                    break;
                                }
                            }

                            if (!restored)
                            {
                                // Cannot restore from backup — skip instead of deleting
                                Console.WriteLine($"[Zenkord] Warning: Cannot restore {pf} (no backup found). Skipping to avoid data loss.");
                            }
                        }

                        // Only remove Zenkord's own app/ injection — not other mods
                        var innerAppDir = Path.Combine(corePath, "app");
                        if (Directory.Exists(innerAppDir))
                        {
                            var innerPkg = Path.Combine(innerAppDir, "package.json");
                            if (File.Exists(innerPkg))
                            {
                                var pkgContent = File.ReadAllText(innerPkg);
                                bool isZenkordInjection = pkgContent.Contains("\"zenkord\"");
                                if (isZenkordInjection)
                                {
                                    try { Directory.Delete(innerAppDir, true); } catch { }
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Zenkord] CleanModulePatches warning: {ex.Message}");
            }
        }

        private void DoUninject(string resPath)
        {
            var appDir = Path.Combine(resPath, "app");
            var backup = Path.Combine(resPath, "_app.asar");
            var appAsar = Path.Combine(resPath, "app.asar");

            SetProgress(10, "Closing Discord...");
            KillDiscord(resPath);

            SetProgress(30, "Removing injected folder...");
            if (Directory.Exists(appDir))
            {
                var pkg = Path.Combine(appDir, "package.json");
                if (File.Exists(pkg) && File.ReadAllText(pkg).Contains("\"zenkord\""))
                {
                    Directory.Delete(appDir, true);
                }
            }

            if (Directory.Exists(appAsar))
            {
                Directory.Delete(appAsar, true);
            }

            SetProgress(50, "Restoring original files...");
            if (File.Exists(appAsar) && new FileInfo(appAsar).Length < 1000000) {
                File.Delete(appAsar);
            }

            if (File.Exists(backup))
            {
                if (!File.Exists(appAsar)) {
                    File.Move(backup, appAsar);
                } else {
                    File.Delete(backup);
                }
            }

            SetProgress(70, "Cleaning up assets...");
            var appBase = Path.GetDirectoryName(resPath);

            var buildInfoPath = Path.Combine(resPath, "build_info.json");
            if (File.Exists(buildInfoPath)) {
                try {
                    var json = File.ReadAllText(buildInfoPath);
                    if (json.Contains("\"localModulesRoot\"")) {
                        json = Regex.Replace(json, @",\s*""localModulesRoot""\s*:\s*""modules""\s*", "");
                        File.WriteAllText(buildInfoPath, json);
                    }
                } catch { }
            }

            string[] filesToClean = { "node.exe", "yt-dlp.exe", "ffmpeg.exe" };
            foreach (var f in filesToClean) {
                var p = Path.Combine(appBase, f);
                if (File.Exists(p)) try { File.Delete(p); } catch { }
            }

            string[] dirsToClean = { "mac", "multi-instance-icons", "ghost-server" };
            foreach (var dir in dirsToClean) {
                var p = Path.Combine(appBase, dir);
                if (Directory.Exists(p)) try { Directory.Delete(p, true); } catch { }
            }

            SetProgress(95, "Restarting Discord...");
            StartDiscord(resPath);
            SetProgress(100, "Done!");
        }

        private void WriteLoader(string appDir)
        {
            var patcher = Path.Combine(_distDir, "patcher.js").Replace("\\", "/");
            File.WriteAllText(Path.Combine(appDir, "package.json"), "{\"name\":\"zenkord\",\"main\":\"index.js\"}");
            // If patcher.js is missing (update in progress, files removed), wait up to 5 s,
            // then start Discord without Zenkord instead of crashing with an error dialog.
            File.WriteAllText(Path.Combine(appDir, "index.js"), $$"""
                // Zenkord Injector
                "use strict";
                const fs = require("fs");
                const path = require("path");
                const primary = {{JsonEscape(patcher)}};
                const exeDir = path.dirname(process.execPath);
                const candidates = [primary, path.join(exeDir, "resources", "dist", "patcher.js"), path.join(exeDir, "dist", "patcher.js")];
                const find = () => candidates.find(p => fs.existsSync(p));

                let patcherPath = find();
                for (let i = 0; !patcherPath && i < 20; i++) {
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
                    patcherPath = find();
                }

                if (patcherPath) {
                    require(patcherPath);
                } else {
                    console.error("[Zenkord] patcher.js not found, starting Discord without Zenkord. Expected at: " + primary);
                    const asar = path.join(__dirname, "..", "_app.asar");
                    const pkg = require(path.join(asar, "package.json"));
                    require("electron").app.setAppPath(asar);
                    require.main.filename = path.join(asar, pkg.main);
                    require(path.join(asar, pkg.main));
                }

                """);
        }

        private string JsonEscape(string s)
        {
            return System.Text.Json.JsonSerializer.Serialize(s);
        }

        private void CopyAssetsToDiscord(string resPath)
        {
            SetProgress(95, "Copying binaries...");
            var appBase = Path.GetDirectoryName(resPath);

            string[] filesToCopy = { "ffmpeg.exe", "ffmpeg.dll", "node.exe", "yt-dlp.exe" };
            foreach (var f in filesToCopy) {
                var src = Path.Combine(_distDir, f);
                if (File.Exists(src)) File.Copy(src, Path.Combine(appBase, f), true);
            }

            SetProgress(96, "Copying directories...");
            string[] dirsToCopy = { "mac", "multi-instance-icons", "modules", "ghost-server" };
            foreach (var dir in dirsToCopy) {
                var src = Path.Combine(_distDir, dir);
                if (Directory.Exists(src)) CopyDirectory(src, Path.Combine(appBase, dir));
            }

            SetProgress(98, "Patching build info...");
            var buildInfoPath = Path.Combine(resPath, "build_info.json");
            if (File.Exists(buildInfoPath)) {
                try {
                    var json = File.ReadAllText(buildInfoPath);
                    if (!json.Contains("\"localModulesRoot\"")) {
                        var idx = json.LastIndexOf('}');
                        if (idx != -1) {
                            json = json.Insert(idx, ",\n  \"localModulesRoot\": \"modules\"\n");
                            File.WriteAllText(buildInfoPath, json);
                        }
                    }
                } catch { }
            }
        }

        private void CopyDirectory(string sourceDir, string destinationDir)
        {
            Directory.CreateDirectory(destinationDir);
            foreach (var file in Directory.GetFiles(sourceDir))
                File.Copy(file, Path.Combine(destinationDir, Path.GetFileName(file)), true);
            foreach (var directory in Directory.GetDirectories(sourceDir))
                CopyDirectory(directory, Path.Combine(destinationDir, Path.GetFileName(directory)));
        }

        private void KillDiscord(string resPath)
        {
            SetStatus("loading", "Closing Discord...");
            var procName = resPath.Contains("DiscordPTB") ? "DiscordPTB" :
                           resPath.Contains("DiscordCanary") ? "DiscordCanary" :
                           resPath.Contains("DiscordDevelopment") ? "DiscordDevelopment" : "Discord";
            foreach (var process in Process.GetProcessesByName(procName))
            {
                try { process.Kill(); process.WaitForExit(3000); } catch { }
            }
            System.Threading.Thread.Sleep(1000);
        }

        private void StartDiscord(string resPath)
        {
            try {
                var exe = Path.Combine(Path.GetDirectoryName(resPath), "..", "Update.exe");
                var procName = resPath.Contains("DiscordPTB") ? "DiscordPTB.exe" :
                               resPath.Contains("DiscordCanary") ? "DiscordCanary.exe" :
                               resPath.Contains("DiscordDevelopment") ? "DiscordDevelopment.exe" : "Discord.exe";

                if (File.Exists(exe)) Process.Start(exe, $"--processStart {procName}");
            } catch { }
        }

        private string ExtractJsonValue(string json, string key, string matchPattern = null)
        {
            var matches = Regex.Matches(json, $"\"{key}\"\\s*:\\s*\"([^\"]+)\"");
            foreach (Match m in matches)
            {
                var val = m.Groups[1].Value;
                if (matchPattern == null || val.EndsWith(matchPattern)) return val;
            }
            return null;
        }

        // ── SHA-256 verification helpers ────────────────────────────────────

        /// <summary>
        /// Reads the expected SHA-256 from update-manifest.json, published by CI
        /// in the same release as zenkord-dist.zip. Returns null if unavailable.
        /// </summary>
        private async Task<string> DownloadChecksumAsync(string zipDownloadUrl)
        {
            try
            {
                using (var req = new HttpRequestMessage(HttpMethod.Get, zipDownloadUrl.Replace(DIST_ZIP, "update-manifest.json")))
                {
                    req.Headers.Add("User-Agent", "Zenkord-Installer/2.0");
                    var resp = await _http.SendAsync(req);
                    if (!resp.IsSuccessStatusCode) return null;
                    var match = Regex.Match(await resp.Content.ReadAsStringAsync(), "\"sha256\"\\s*:\\s*\"([a-fA-F0-9]{64})\"");
                    return match.Success ? match.Groups[1].Value.ToLowerInvariant() : null;
                }
            }
            catch
            {
                return null;
            }
        }

        private static string ComputeSha256(string filePath)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                var hash = sha256.ComputeHash(stream);
                var sb = new StringBuilder(64);
                foreach (var b in hash) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }
    }
}
