<template>
  <div>
    <!-- 打开对话框按钮 -->
    <button @click="visible = true" class="open-btn">查看传感器数值</button>

    <!-- 对话框 -->
    <div v-if="visible" class="mask" @click.self="visible = false">
      <div class="dialog">
        <div class="dialog-header">
          <h3>传感器实时数值</h3>
          <button @click="visible = false" class="close-icon">×</button>
        </div>

        <!-- 传感器数值显示 -->
        <div class="sensor-section">
          <div class="sensor-item">
            <span class="label">旋转可调电阻 (ADJ)：</span>
            <span class="value">{{ adjValue }}</span>
          </div>
          <div class="sensor-item">
            <span class="label">温度传感电阻 (NTC)：</span>
            <span class="value">{{ ntcValue }}</span>
          </div>
          <div class="sensor-item">
            <span class="label">光敏电阻 (GR)：</span>
            <span class="value">{{ grValue }}</span>
          </div>
        </div>

        <!-- 光敏电阻曲线图 -->
        <div class="chart-section">
          <h4>光敏电阻变化曲线（最近5分钟，每5秒记录）</h4>
          <div class="chart-container">
            <Line :data="chartData" :options="chartOptions" />
          </div>
        </div>

        <button @click="visible = false" class="close-btn">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const visible = ref(false);
const adjValue = ref('---');  // 旋转可调电阻
const ntcValue = ref('---');  // 温度传感电阻
const grValue = ref('---');   // 光敏电阻

// 光敏电阻历史数据：存储最近5分钟的数据点（每5秒记录一次，共60个点）
const grHistory = ref([]);  // [{ time: 'HH:MM:SS', value: 123, timestamp: 1234567890 }, ...]
let recordTimer = null;  // 每5秒记录一次的定时器
const MAX_DATA_POINTS = 60;  // 5分钟 = 300秒，每5秒一次 = 60个数据点

let ws = null;

// 获取当前时间的完整格式（HH:MM:SS）
const getCurrentTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
};

// 添加数据点到历史记录（每5秒记录一次）
const addDataPoint = () => {
  if (grValue.value !== '---') {
    const numValue = parseInt(grValue.value) || 0;
    const currentTime = getCurrentTime();
    const timestamp = Date.now();

    grHistory.value.push({
      time: currentTime,
      value: numValue,
      timestamp: timestamp
    });

    // 只保留最近5分钟的数据（60个点）
    if (grHistory.value.length > MAX_DATA_POINTS) {
      grHistory.value.shift();
    }
  }
};

// 图表数据配置
const chartData = computed(() => {
  const labels = grHistory.value.map(item => {
    // 只显示分:秒，减少标签长度
    return item.time.substring(3); // 从 "HH:MM:SS" 中取 "MM:SS"
  });
  const values = grHistory.value.map(item => item.value);

  return {
    labels: labels.length > 0 ? labels : [getCurrentTime().substring(3)],
    datasets: [
      {
        label: '光敏电阻数值',
        data: values.length > 0 ? values : [0],
        borderColor: 'rgb(33, 150, 243)',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: 'rgb(33, 150, 243)',
        pointBorderColor: '#fff',
        pointBorderWidth: 1
      }
    ]
  };
});

// 图表选项配置
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'top',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    }
  },
  scales: {
    x: {
      display: true,
      title: {
        display: true,
        text: '时间 (分:秒)'
      },
      ticks: {
        maxRotation: 45,
        minRotation: 45,
        maxTicksLimit: 12  // 最多显示12个时间标签
      }
    },
    y: {
      display: true,
      title: {
        display: true,
        text: '数值'
      },
      beginAtZero: false
    }
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false
  }
};

onMounted(() => {
  // 连接到 Node.js WebSocket 服务器
  ws = new WebSocket('ws://localhost:8080');

  ws.onopen = () => {
    console.log('WebSocket connected');
    // 立即记录第一个数据点
    addDataPoint();
    // 启动每5秒记录一次的定时器
    recordTimer = setInterval(() => {
      addDataPoint();
    }, 5000); // 每5秒（5000毫秒）记录一次
  };

  ws.onmessage = (event) => {
    const msg = event.data.trim(); // 去除换行符，例如 "ADJ:123"

    // 根据前缀解析不同的传感器数值
    if (msg.startsWith('ADJ:')) {
      adjValue.value = msg.slice(4); // 截掉 "ADJ:"
    } else if (msg.startsWith('NTC:')) {
      ntcValue.value = msg.slice(4); // 截掉 "NTC:"
    } else if (msg.startsWith('GR:')) {
      const grVal = msg.slice(3); // 截掉 "GR:"
      grValue.value = grVal;
      // 数据点会通过定时器每5秒自动记录
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error', err);
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
  };
});

onBeforeUnmount(() => {
  if (ws) ws.close();
  if (recordTimer) clearInterval(recordTimer);
});
</script>

<style scoped>
.open-btn {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 12px 24px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: all 0.3s;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}
.open-btn:hover {
  background: #1976D2;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  transform: translateY(-1px);
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.dialog {
  background: #fff;
  padding: 0;
  border-radius: 12px;
  min-width: 600px;
  max-width: 90vw;
  max-height: 90vh;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}
.dialog-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.close-icon {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}
.close-icon:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

.sensor-section {
  padding: 24px;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 20px 24px;
}
.sensor-item {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #e0e0e0;
}
.sensor-item:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
}
.label {
  font-weight: 500;
  color: #555;
  font-size: 15px;
}
.value {
  font-size: 20px;
  font-weight: bold;
  color: #2196F3;
  font-family: 'Courier New', monospace;
  background: white;
  padding: 4px 12px;
  border-radius: 4px;
  min-width: 80px;
  text-align: right;
}

.chart-section {
  padding: 0 24px 24px;
}
.chart-section h4 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 16px;
  font-weight: 600;
}
.chart-container {
  height: 300px;
  width: 100%;
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.close-btn {
  width: calc(100% - 48px);
  margin: 0 24px 24px;
  padding: 12px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: all 0.3s;
}
.close-btn:hover {
  background: #1976D2;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(33, 150, 243, 0.3);
}
</style>


