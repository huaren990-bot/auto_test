# SimTest Ubuntu 22.04 离线安装

本包内置 Linux Node.js 运行时和初始 SQLite 数据库快照。目标机安装和使用时不需要互联网、Node.js、npm 或 sqlite3 命令。

## 系统要求

- Ubuntu 22.04 64 位，架构必须与包名一致：`amd64` 对应 Intel/AMD x86_64，`arm64` 对应 64 位 ARM。
- 安装为系统服务时需要 sudo 权限。无 sudo 时可使用便携模式。
- 浏览器建议使用 Ubuntu 22.04 自带 Firefox 或近期 Chromium。

## 方式一：安装 DEB 包

将 `.deb` 和对应 `.sha256` 复制到离线机器，然后执行：

```bash
sha256sum -c simtest_0.3.0_amd64.deb.sha256
sudo dpkg -i simtest_0.3.0_amd64.deb
simtestctl check
```

本机浏览器打开 `http://127.0.0.1:4173`。

常用命令：

```bash
simtestctl status
sudo simtestctl restart
sudo simtestctl logs
sudo simtestctl backup /path/to/backup.sqlite
```

如果系统未启用 systemd（例如部分 WSL 环境），可执行 `sudo -u simtest simtestctl foreground`。

默认数据位于 `/var/lib/simtest/simtest.sqlite`。重新安装或升级不会覆盖现有数据库。

## 方式二：解压后直接运行

```bash
sha256sum -c simtest-offline-0.3.0-ubuntu22.04-amd64.tar.gz.sha256
tar -xzf simtest-offline-0.3.0-ubuntu22.04-amd64.tar.gz
cd simtest-offline-0.3.0-ubuntu22.04-amd64
./verify.sh
./run-portable.sh
```

数据默认保存在解压目录的 `state/simtest.sqlite`。也可以指定目录和端口：

```bash
./run-portable.sh --data-dir "$HOME/simtest-data" --port 4174
```

解压包也可安装为系统服务：

```bash
sudo ./install.sh
```

## 局域网访问

默认只允许本机浏览器访问。如果需要在可信的离线局域网中从其他电脑访问，安装时使用：

```bash
sudo ./install.sh --host 0.0.0.0 --port 4173
```

或修改 `/etc/default/simtest` 后执行 `sudo simtestctl restart`。服务当前没有登录鉴权，不要将端口暴露到不可信网络。

## 卸载

DEB 安装：

```bash
sudo dpkg -r simtest       # 保留数据
sudo dpkg -P simtest       # 同时删除数据和专用用户
```

解压包安装：

```bash
sudo /opt/simtest/uninstall.sh
sudo /opt/simtest/uninstall.sh --purge-data
```
