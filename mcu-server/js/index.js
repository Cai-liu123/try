// index.js
const { SerialPort, ReadlineParser } = require('serialport');
const WebSocket = require('ws');

// 1. 串口配置：把 COM3 改成你设备管理器里看到的端口号
const port = new SerialPort({
  path: 'COM3',    // 比如 COM4 / COM5
  baudRate: 4800,  // 和单片机一致
  autoOpen: false  // 手动打开，便于错误处理
});

// 串口错误处理
port.on('error', (err) => {
  console.error('串口错误:', err.message);
  console.error('请检查：1. 串口号是否正确 2. 串口是否被其他程序占用');
});

port.on('open', () => {
  console.log('串口已打开:', port.path);
});

// 2. 创建解析器
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// 3. WebSocket 服务器，供 Vue 连接
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('WebSocket 客户端已连接');
  
  ws.on('close', () => {
    console.log('WebSocket 客户端已断开');
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket 错误:', err);
  });
});

// 4. 串口收到一行数据（例如 "ADJ:123"、"NTC:456"、"GR:789"），就推送给所有浏览器
parser.on('data', line => {
  const trimmedLine = line.trim();
  if (trimmedLine) {
    console.log('串口数据:', trimmedLine);
    // 推送给所有已连接的 WebSocket 客户端
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(trimmedLine);
      }
    });
  }
});

// 5. 打开串口
port.open((err) => {
  if (err) {
    console.error('串口打开失败:', err.message);
    console.error('请检查串口号是否正确（当前: COM3）');
    return;
  }
});

console.log('WebSocket 服务器运行在 ws://localhost:8080');
console.log('等待串口连接...');