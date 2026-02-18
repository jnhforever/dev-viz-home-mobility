<template>
  <div class="home">
    <div class="legend">
      <div class="legend-item">
        <span class="legend-color orange"></span>
        A → B
      </div>
      <div class="legend-item">
        <span class="legend-color blue"></span>
        B → A
      </div>
      <div class="legend-item">
        <span class="legend-color red"></span>
        단방향
      </div>
    </div>
    <h2>Home mobility Visualization</h2>
    <button class="btn-init" @click="resetAll">초기화</button>
    <div class="controls">
      <label class="file-btn">
        RawData(엑셀) 선택
        <input type="file" accept=".xlsx" @change="onExcelUpload" hidden />
      </label>
      <span class="file-name">
        {{ excelFileName || "선택된 파일 없음" }}
      </span>

      <!-- 도면 -->
      <label class="file-btn">
        도면 이미지 선택
        <input type="file" accept="image/*" @change="onImageUpload" hidden />
      </label>
      <span class="file-name">
        {{ imageFileName || "선택된 파일 없음" }}
      </span>
      <!-- <button @click="drawPath" :disabled="!readyToDraw">Path 그리기</button>-->
      <button @click="saveImage">PNG 저장</button>
    </div>

    <div class="layout">

      <div class="panel">
        <h3>위치 매핑</h3>

        <table class="mapping-table">
          <thead>
            <tr>
              <th>LocName</th>
              <th>LocHex</th>
              <th>Type</th>
              <th>Mapped</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="loc in mappingList" :key="loc.LocHex" :class="{
              active: selectedLoc === loc.LocHex,
              disabled: loc.type === 'state'
            }" @click="loc.type === 'space' && (selectedLoc = loc.LocHex)">
              <td>{{ loc.LocName }}</td>
              <td>{{ loc.LocHex }}</td>
              <td>
                <span v-if="loc.type === 'state'">상태</span>
                <span v-else>위치</span>
              </td>
              <td>
                <span v-if="sensorMap[loc.LocHex]">✔</span>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </table>

        <p class="hint">위치 선택 후 도면 클릭</p>
      </div>


      <div class="canvas-wrap">
        <canvas ref="canvas" @click="onCanvasClick" @mousemove="onCanvasHover" @mouseleave="hideTooltip"></canvas>
        <div class="legend" v-if="totalDistance != null">
          <div class="legend-item">
            이동거리:{{ totalDistance }}
          </div>

        </div>
      </div>
      <div v-if="tooltip.visible" class="tooltip" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        {{ tooltip.text }}
      </div>
      <div class="panel" :class="{ disabled: !readyToDraw }">
        <h3>시간대별</h3>
        <div v-for="(hour, index) in hourList" :class="{ active: selectedHour === index }" :key="index" class="hour-row"
          @click="selectHour(index)">
          {{ hour }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import * as XLSX from "xlsx";
import axios from "axios"
export default {
  name: "MainView",
  components: {
    //  HelloWorld,
  },
  data() {
    return {
      totalDistance: null,
      selectedHour: null,
      tooltip: {
        visible: false,
        x: 0,
        y: 0,
        text: ""
      },
      excelFileName: "",
      imageFileName: "",
      mappingList: [],          // Mapping 탭
      rawData: [],              // RawData 탭
      sensorMap: {},             // LocHex -> {x,y}
      selectedLoc: null,
      image: null,
      ctx: null,
      canvasWidth: 800,
      canvasHeight: 600,
    };
  },
  computed: {
    hourList() {
      return Array.from({ length: 24 }, (_, i) =>
        `${String(i).padStart(2, "0")}:00-${String(i + 1).padStart(2, "0")}:00`
      );
    },
    readyToDraw() {
      return (
        this.mappingList.length &&
        this.rawData.length &&
        Object.keys(this.sensorMap).length >= 2
      );
    },
  },
  async mounted() {
    //this.uploadFile();
    const canvas = this.$refs.canvas;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    this.ctx = canvas.getContext("2d");

    await this.getDefaults();
  },

  methods: {
    filterDataByHour(hour) {
      const startMinute = hour * 60;
      const endMinute = startMinute + 60;

      return this.rawData.filter(row => {
        const minute = Number(row.MinuteIdx);
        return minute >= startMinute && minute < endMinute;
      });
    },
    async getDefaults() {
      this.loadImage("floorplan1.png");
      this.loadExcelFromPublic("test.xlsx");
    },
    async loadExcelFromPublic(path) {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          alert("엑셀 파일을 불러올 수 없습니다.");
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        this.excelFileName = path.split("/").pop();

        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        // =============================
        // Mapping 시트 처리
        // =============================
        const mappingSheet = workbook.Sheets["Mapping"];
        if (!mappingSheet) {
          alert("Mapping 시트를 찾을 수 없습니다.");
          return;
        }

        const rawMapping = XLSX.utils.sheet_to_json(mappingSheet, {
          header: 1,
          defval: ""
        });

        if (rawMapping.length < 4) {
          alert("Mapping 시트 형식이 올바르지 않습니다.");
          return;
        }

        this.mappingList = rawMapping
          .slice(3)
          .filter((row) => row[0])
          .map((row) => {
            const locHex = String(row[0]);
            return {
              LocHex: locHex,
              LocName: row[1],
              LegendColor: row[2] || "#000000",
              type: locHex === "FE" ? "state" : "space"
            };
          });

        // =============================
        // RawData 시트 처리
        // =============================
        const rawSheet = workbook.Sheets["RawData"];
        if (!rawSheet) {
          alert("RawData 시트를 찾을 수 없습니다.");
          return;
        }

        const rawData = XLSX.utils.sheet_to_json(rawSheet);
        console.log(rawData)
        const requiredCols = ["MinuteIdx", "LocHex_norm"];
        const firstRow = rawData[0];

        if (!firstRow) {
          alert("RawData 시트에 데이터가 없습니다.");
          return;
        }

        for (const col of requiredCols) {
          if (!(col in firstRow)) {
            alert(`RawData 시트에 필수 컬럼이 없습니다: ${col}`);
            return;
          }
        }

        this.rawData = rawData;

        alert("엑셀 자동 로드 완료");

      } catch (err) {
        console.error(err);
        alert("엑셀 자동 로딩 중 오류 발생");
      }

    },
    loadImage(src) {
      const img = new Image();

      img.onload = () => {
        this.canvasWidth = img.width;
        this.canvasHeight = img.height;

        const canvas = this.$refs.canvas;
        canvas.width = img.width;
        canvas.height = img.height;

        this.ctx.drawImage(img, 0, 0);
        this.image = img;
      };

      img.src = src;
    },
    async uploadFile() {
      try {
        const response = await fetch('/테스트입니다.txt');
        const blob = await response.blob();

        const formData = new FormData();
        formData.append("userId", "1009575");
        formData.append("sessionUuid", "sess_D8IaMHUGGcQcRo5Diwtix");
        formData.append("file", blob, "테스트입니다.txt");

        const result = await axios.post(
          'https://xapi.livon.care/api/v1/openai/conversation/upload',
          formData,
          {
            headers: {
              authentication: "72UGn#bTOGkg"

            }
          }
        );

        console.log(result.data);

      } catch (error) {
        console.error(error);
      }
    },
    resetAll() {
      this.totalDistance = null;
      this.selectedHour = null;

      this.tooltip = {
        visible: false,
        x: 0,
        y: 0,
        text: ""
      }
      this.mappingList = [];
      this.rawData = [];
      this.sensorMap = {};
      this.excelFileName = "";
      this.imageFileName = "";
      this.selectedLoc = null;

      this.image = null;

      if (this.ctx) {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      }

      const canvas = this.$refs.canvas;
      canvas.width = 800;
      canvas.height = 600;
      this.canvasWidth = 800;
      this.canvasHeight = 600;

      const inputs = document.querySelectorAll('input[type="file"]');
      inputs.forEach((input) => (input.value = ""));
    },
    /* ======================
       Excel 업로드
    ====================== */
    onExcelUpload(e) {
      const file = e.target.files?.[0];
      if (!file) {
        alert("엑셀 파일이 선택되지 않았습니다.");
        return;
      }
      const reader = new FileReader();
      this.excelFileName = file.name;
      reader.onload = (evt) => {
        const workbook = XLSX.read(evt.target.result, { type: "array" });

        const mappingSheet = workbook.Sheets["Mapping"];
        if (!mappingSheet) {
          alert("Mapping 시트를 찾을 수 없습니다.");
          return;
        }
        const rawMapping = XLSX.utils.sheet_to_json(mappingSheet, {
          header: 1,
          defval: ""
        });
        if (rawMapping.length < 4) {
          alert("Mapping 시트 형식이 올바르지 않습니다.");
          return;
        }
        this.mappingList = rawMapping
          .slice(3)
          .filter((row) => row[0])
          .map((row) => {
            const locHex = String(row[0]);
            return {
              LocHex: locHex,
              LocName: row[1],
              LegendColor: row[2] || "#000000",
              type: locHex === "FE" ? "state" : "space"
            };
          });
        //console.log(this.mappingList)
        const rawSheet = workbook.Sheets["RawData"];
        if (!rawSheet) {
          alert("RawData 시트를 찾을 수 없습니다.");
          return;
        }

        const rawData = XLSX.utils.sheet_to_json(rawSheet);

        const requiredCols = ["MinuteIdx", "LocHex_norm"];
        const firstRow = rawData[0];

        if (!firstRow) {
          alert("RawData 시트에 데이터가 없습니다.");
          return;
        }

        for (const col of requiredCols) {
          if (!(col in firstRow)) {
            alert(`RawData 시트에 필수 컬럼이 없습니다: ${col}`);
            return;
          }
        }

        this.rawData = rawData;
        alert("엑셀 로드 완료");
      };

      reader.readAsArrayBuffer(file);
    },


    onImageUpload(e) {
      const file = e.target.files[0];
      const img = new Image();
      this.imageFileName = file.name;
      img.onload = () => {
        this.canvasWidth = img.width;
        this.canvasHeight = img.height;

        const canvas = this.$refs.canvas;
        canvas.width = img.width;
        canvas.height = img.height;

        this.ctx.drawImage(img, 0, 0);
        this.image = img;
      };

      img.src = URL.createObjectURL(file);
    },


    onCanvasClick(e) {
      if (!this.selectedLoc) return;

      const loc = this.mappingList.find(
        (l) => l.LocHex === this.selectedLoc
      );

      if (!loc || loc.type !== "space") return;
      const rect = this.$refs.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.sensorMap[this.selectedLoc] = { x, y };
      this.redraw();

      this.selectedLoc = null;
    },


    buildPathSequence() {
      const sorted = [...this.rawData].sort(
        (a, b) => a.MinuteIdx - b.MinuteIdx
      );

      const seq = [];
      let prev = null;

      sorted.forEach((row) => {
        const loc = row.LocHex_norm;
        if (!loc || loc === "FE") {
          prev = null;
          return;
        }
        if (loc !== prev) {
          seq.push(loc);
          prev = loc;
        }
      });

      return seq;
    },
    selectHour(hour) {

      this.selectedHour = hour;

      const filtered = this.filterDataByHour(hour);
      this.pathEdges = this.buildPathEdges(filtered);
      const stayMap = this.buildStayMap(filtered);
      this.redraw();

      this.drawPath(this.pathEdges);
      this.drawStayCircles(stayMap);
      const totalDistance = filtered.reduce(
        (sum, row) => sum + Number(row.Distance_m || 0),
        0
      );

      this.totalDistance = totalDistance.toFixed(3);

    },
    buildPathEdges(data) {
      const sorted = [...data].sort(
        (a, b) => Number(a.MinuteIdx) - Number(b.MinuteIdx)
      );

      const edges = {}; // "A->B": { from, to, count }

      let prev = null;

      sorted.forEach(row => {
        const curr = row.LocHex_norm;

        // FE 제외
        if (!curr || curr === "FE") {
          prev = null;
          return;
        }

        if (prev && prev !== curr) {
          const key = `${prev}->${curr}`;

          if (!edges[key]) {
            edges[key] = {
              from: prev,
              to: curr,
              count: 0
            };
          }

          edges[key].count += 1;
        }

        prev = curr;
      });

      return Object.values(edges);
    },
    drawPath(edges) {
      // this.redraw();

      const bidirectionalMap = {};
      edges.forEach(edge => {
        const key = `${edge.from}->${edge.to}`;
        bidirectionalMap[key] = true;
      });

      edges.forEach(edge => {
        this.drawEdge(edge, bidirectionalMap);
      });
    },
    drawEdge(edge, bidirectionalMap) {
      const p1 = this.sensorMap[edge.from];
      const p2 = this.sensorMap[edge.to];
      if (!p1 || !p2) return;

      let offsetX = 0;
      let offsetY = 0;

      const reverseKey = `${edge.to}->${edge.from}`;
      const isBidirectional = bidirectionalMap[reverseKey];

      if (isBidirectional) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        const normalX = -dy / length;
        const normalY = dx / length;

        const offset = 6;
        offsetX = normalX * offset;
        offsetY = normalY * offset;
      }


      let strokeColor = "red";

      if (isBidirectional) {
        // from 기준으로 정렬해서 방향 판별
        strokeColor =
          edge.from < edge.to ? "#ff8c00" : "#007bff"; // 주황 / 파랑
      }

      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = 1 + (edge.count || 1) * 0.5;

      this.ctx.beginPath();
      this.ctx.moveTo(p1.x + offsetX, p1.y + offsetY);
      this.ctx.lineTo(p2.x + offsetX, p2.y + offsetY);
      this.ctx.stroke();

      this.ctx.strokeStyle = strokeColor;

      this.drawArrow(
        p1.x + offsetX,
        p1.y + offsetY,
        p2.x + offsetX,
        p2.y + offsetY
      );
    },
    drawArrow(fromX, fromY, toX, toY) {
      const headLength = 8;

      const dx = toX - fromX;
      const dy = toY - fromY;
      const angle = Math.atan2(dy, dx);

      const arrowX = toX - 6 * Math.cos(angle);
      const arrowY = toY - 6 * Math.sin(angle);

      this.ctx.beginPath();
      this.ctx.moveTo(arrowX, arrowY);
      this.ctx.lineTo(
        arrowX - headLength * Math.cos(angle - Math.PI / 6),
        arrowY - headLength * Math.sin(angle - Math.PI / 6)
      );
      this.ctx.moveTo(arrowX, arrowY);
      this.ctx.lineTo(
        arrowX - headLength * Math.cos(angle + Math.PI / 6),
        arrowY - headLength * Math.sin(angle + Math.PI / 6)
      );
      this.ctx.stroke();
    },
    distancePointToLine(px, py, x1, y1, x2, y2) {
      const A = px - x1;
      const B = py - y1;
      const C = x2 - x1;
      const D = y2 - y1;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;

      if (lenSq !== 0) param = dot / lenSq;

      let xx, yy;
      if (param < 0) {
        xx = x1;
        yy = y1;
      } else if (param > 1) {
        xx = x2;
        yy = y2;
      } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
      }

      const dx = px - xx;
      const dy = py - yy;
      return Math.sqrt(dx * dx + dy * dy);
    },
    onCanvasHover(e) {

      if (!this.pathEdges) return;
      const rect = this.$refs.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const edge of this.pathEdges) {
        const p1 = this.sensorMap[edge.from];
        const p2 = this.sensorMap[edge.to];
        if (!p1 || !p2) continue;

        const dist = this.distancePointToLine(
          x, y,
          p1.x, p1.y,
          p2.x, p2.y
        );

        if (dist < 10) { // 5px 이내면 hover
          this.showTooltip(e.clientX, e.clientY, edge);
          return;
        }
      }
      //console.log("hide!!")
      this.hideTooltip();
    },
    showTooltip(x, y, edge) {
      const from = this.mappingList.find(l => l.LocHex === edge.from)?.LocName;
      const to = this.mappingList.find(l => l.LocHex === edge.to)?.LocName;

      const reverseEdge = this.pathEdges.find(
        e => e.from === edge.to && e.to === edge.from
      );

      let text = `${from} → ${to} : ${edge.count}회`;

      if (reverseEdge) {
        text += `\n${to} → ${from} : ${reverseEdge.count}회`;
      }


      this.tooltip = {
        visible: true,
        x: x + 10,
        y: y + 10,
        text
      };
    },

    hideTooltip() {
      this.tooltip.visible = false;
    },
    /* ======================
       다시 그리기
    ====================== */
    redraw() {
      if (!this.image) return;

      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.ctx.drawImage(this.image, 0, 0);

      // 센서 점
      Object.values(this.sensorMap).forEach(({ x, y }) => {
        this.ctx.fillStyle = "blue";
        this.ctx.beginPath();
        this.ctx.arc(x, y, 5, 0, Math.PI * 2);
        this.ctx.fill();
      });
    },

    /* ======================
       PNG 저장
    ====================== */
    saveImage() {
      if (this.selectedHour == null) {
        alert("시간대를 선택해 주세요")
        return;
      }
      const link = document.createElement("a");
      link.download = "movement_path_" + this.selectedHour + ".png";
      link.href = this.$refs.canvas.toDataURL("image/png");
      link.click();
    },
    buildStayMap(data) {
      const stayMap = {};

      data.forEach(row => {
        const loc = row.LocHex_norm;
        if (!loc || loc === "FE") return;

        if (!stayMap[loc]) {
          stayMap[loc] = 0;
        }

        stayMap[loc] += 1; // 1 minute 단위
      });

      return stayMap;
    },
    drawStayCircles(stayMap) {
      const maxStay = Math.max(...Object.values(stayMap));

      Object.entries(stayMap).forEach(([loc, stay]) => {
        const point = this.sensorMap[loc];
        if (!point) return;

        const ratio = stay / maxStay;

        const radius = 10 + ratio * 25; // 체류 많을수록 커짐
        console.log(radius)
        const gradient = this.ctx.createRadialGradient(
          point.x, point.y, 0,
          point.x, point.y, radius
        );

        gradient.addColorStop(0, `rgba(255, 140, 0, ${0.7})`);
        gradient.addColorStop(1, `rgba(255, 140, 0, 0)`);


        this.ctx.beginPath();
        this.ctx.fillStyle = gradient;
        this.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.font = "bold 12px Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        const display = stay.toFixed(0) + "m";
        this.ctx.fillStyle = "rgba(0,0,0,0.6)";
        this.ctx.fillText(
          display,
          point.x + 1,
          point.y + 1
        );

        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillText(
          display,
          point.x,
          point.y
        );
      });
    },
  },

};
</script>
<style scoped>
.tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 999;
}

.btn-init {
  margin-bottom: 30px;
  font-size: 22px;
  height: 40px;
  width: 100px;
}

.controls {

  margin-bottom: 10px;
}

.layout {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.panel {
  width: 240px;
  border: 1px solid #ccc;
  padding: 8px;
}

.panel ul {
  list-style: none;
  padding: 0;
}

.panel li {
  padding: 4px;
  cursor: pointer;
}

.panel li.active {
  background: #e3f2fd;
}

.panel li.disabled {
  color: #aaa;
  cursor: not-allowed;
}

.panel.disabled {
  opacity: 0.5;
  pointer-events: none;
}


.hint {
  font-size: 12px;
  color: #666;
}

.mapping-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.mapping-table th,
.mapping-table td {
  border: 1px solid #ccc;
  padding: 4px 6px;
  text-align: center;
}

.mapping-table tr.active {
  background: #e3f2fd;
}

.mapping-table tr.disabled {
  color: #aaa;
  background: #f9f9f9;
  cursor: not-allowed;
}

.mapping-table tr:hover {
  background: #f1f1f1;
  cursor: pointer;
}

.file-btn {
  display: inline-block;
  padding: 6px 12px;
  background: #1976d2;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  margin-right: 6px;
}

.file-btn:hover {
  background: #1565c0;
}

.file-name {
  margin-right: 16px;
  font-size: 12px;
  color: #555;
}

.hour-row:hover {
  background: #f1f1f1;
  cursor: pointer;
}

.hour-row.active {
  background: #e3f2fd;
  color: black;
}

.canvas-wrap {
  border: 1px solid #ccc;
  position: relative;
  display: inline-block;
}

.canvas-wrapper {}

.legend {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.9);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  opacity: 0.5;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.legend-color {
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border-radius: 3px;
}

.orange {
  background: #ff8c00;
}

.blue {
  background: #007bff;
}

.gray {
  background: #999;
}

.red {
  background: red;
}
</style>
