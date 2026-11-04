module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "Gestor OS",
    appBundleId: "br.com.bpstec.os",
    win32metadata: {
      CompanyName: "Edson Silva",
      FileDescription: "Sistema de ordens de servico",
      ProductName: "Gestor OS",
    },
    ignore: [/^\/test($|\/)/, /^\/docs($|\/)/, /^\/\.git($|\/)/],
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: { name: "bps_tec_os", setupExe: "Gestor-OS-Setup.exe" },
    },
  ],
};
