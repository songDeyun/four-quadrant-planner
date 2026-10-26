using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string page = Path.Combine(root, "web", "index.html");
        if (!File.Exists(page))
        {
            MessageBox.Show("找不到 web/index.html。请先解压完整文件夹，保留 exe 旁边的 web 文件夹。", "四象限计划", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        string[] locations = {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
        };
        foreach (string browser in locations)
        {
            if (!File.Exists(browser)) continue;
            try
            {
                Process.Start(new ProcessStartInfo(browser, "--app=\"" + new Uri(page).AbsoluteUri + "\" --start-maximized") {
                    WorkingDirectory = root, UseShellExecute = false
                });
                return;
            }
            catch (Exception error)
            {
                MessageBox.Show("启动失败：" + error.Message, "四象限计划", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }
        MessageBox.Show("需要安装 Microsoft Edge 或 Google Chrome 才能显示界面。当前 exe 使用浏览器应用模式，不是内嵌 WebView2 的独立运行时。", "四象限计划", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}
