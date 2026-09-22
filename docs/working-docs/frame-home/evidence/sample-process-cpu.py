"""Read-only Linux process counters; no profile files, process environment or memory contents."""
import datetime
import json
import os
import re
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[4]
TICKS = os.sysconf('SC_CLK_TCK')

def snapshot():
    result = {}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            argv = entry.joinpath('cmdline').read_bytes().split(b'\0')
            command = b' '.join(argv).decode(errors='replace')
            if str(ROOT) + '/' not in command:
                continue
            executable = Path(command.split()[0]).name
            # Exclude shells/tooling reading this script. Includes Electron helper processes.
            if executable not in ('frame-home', 'electron'):
                continue
            type_match = re.search(r'--type=([^\s]+)', command)
            process_type = type_match.group(1) if type_match else ''
            role = ('balances-worker' if '/externalData/balances/worker.js' in command else
                    'signer-worker' if '/signers/hot/' in command and '/worker.js' in command else
                    process_type or 'main')
            fields = entry.joinpath('stat').read_text().split(') ', 1)[1].split()
            result[entry.name] = {'role': role, 'ticks': int(fields[11]) + int(fields[12])}
        except (OSError, ValueError):
            continue
    return result

samples = []
for _ in range(3):
    before = snapshot()
    start = time.monotonic()
    time.sleep(10)
    elapsed = time.monotonic() - start
    after = snapshot()
    grouped = {}
    for pid, item in after.items():
        if pid not in before:
            continue
        group = grouped.setdefault(item['role'], {'processes': 0, 'cpuPercentOneCore': 0})
        group['processes'] += 1
        group['cpuPercentOneCore'] += (item['ticks'] - before[pid]['ticks']) / TICKS / elapsed * 100
    for group in grouped.values():
        group['cpuPercentOneCore'] = round(group['cpuPercentOneCore'], 2)
    samples.append({'seconds': round(elapsed, 2), 'groups': grouped})

output = {'measuredAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'note': 'Read-only counters from the already-running app; uncontrolled workload. 100% is one logical CPU. No UI visibility, RPC volume or function-level trace is inferred.',
          'samples': samples}
text = json.dumps(output, indent=2) + '\n'
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(text)
print(text)
