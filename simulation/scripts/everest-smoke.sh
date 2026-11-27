#!/usr/bin/env bash
set -euo pipefail
# Native dashboard commands only; station must be idle before this manual smoke.
case "${1:-}" in
  unplug)
    docker compose exec -T mqtt-server mosquitto_pub -q 0 -t everest_external/nodered/1/carsim/cmd/modify_charging_session -m 'unplug'
    ;;
  start)
    docker compose exec -T mqtt-server mosquitto_pub -q 0 -t everest_external/nodered/1/carsim/cmd/execute_charging_session -m 'sleep 1;iec_wait_pwr_ready;sleep 1;draw_power_regulated 16,3;sleep 30;unplug'
    ;;
  authorize)
    docker compose exec -T mqtt-server mosquitto_pub -q 0 -t everest_api/dummy_token_provider/cmd/provide -m '{"id_token":{"value":"A1B2C3D4","type":"ISO14443"},"authorization_type":"RFID","prevalidated":false,"connectors":[1]}'
    ;;
  *) echo 'Use start, then authorize after the native plug event.' >&2; exit 2;;
esac
