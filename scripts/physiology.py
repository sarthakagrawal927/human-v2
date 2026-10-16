"""Pinned Pulse adapter. Acute engine experiments, not intervention/lifetime calibration."""
import argparse
import json
import math
import re
from pathlib import Path
import PyPulse
from pulse.cdm.enums import eSerializationFormat
from pulse.cdm.io.engine import serialize_actions_to_string
from pulse.engine.PulseEngine import PulseEngine, version, git_hash
from pulse.cdm.engine import SEDataRequest, SEDataRequestManager
from pulse.cdm.patient import SEPatientConfiguration, SEPatient, eSex
from pulse.cdm.patient_actions import SEExercise, SERespiratoryMechanicsModification, SECardiovascularMechanicsModification
from pulse.cdm.environment_actions import SEChangeEnvironmentalConditions
from pulse.cdm.scalars import FrequencyUnit, TimeUnit, LengthUnit, MassUnit, AreaUnit, VolumeUnit, PressureUnit, VolumePerTimeUnit, TemperatureUnit, PowerUnit
from pulse.cdm.io.patient import serialize_patient_to_file

ap = argparse.ArgumentParser()
ap.add_argument('--input', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--reference', required=True)
args = ap.parse_args()
config = json.loads(Path(args.input).read_text())
out = Path(args.out)
assert version() == '4.4.0' and git_hash() == '5e29e5b', 'Unqualified engine version'
reference = json.loads(Path(args.reference).read_text())
properties = [('HeartRate', FrequencyUnit.Per_min), ('RespirationRate', FrequencyUnit.Per_min),
 ('OxygenSaturation', None), ('BloodPH', None), ('ArterialCarbonDioxidePressure', PressureUnit.mmHg),
 ('ArterialOxygenPressure', PressureUnit.mmHg), ('MeanArterialPressure', PressureUnit.mmHg),
 ('CardiacOutput', VolumePerTimeUnit.L_Per_min), ('CerebralBloodFlow', VolumePerTimeUnit.mL_Per_min),
 ('TotalPulmonaryVentilation', VolumePerTimeUnit.L_Per_min), ('TidalVolume', VolumeUnit.mL),
 ('CoreTemperature', TemperatureUnit.C), ('TotalMetabolicRate', PowerUnit.W)]
names = [n for n, _ in properties]
e = PulseEngine()
e.log_to_console(False)
e.set_log_filename(str(out.with_suffix('.log')))
pc = SEPatientConfiguration()
p = pc.get_patient()
p.set_name('HumanV2Reference')
p.set_sex(eSex.Male)
p.get_age().set_value(44, TimeUnit.yr)
p.get_height().set_value(180.34, LengthUnit.cm)
p.get_weight().set_value(77.1107, MassUnit.kg)
if config['surface']:
    area = reference['AlveoliSurfaceArea']['ScalarArea']
    assert area['Unit'] == 'cm^2'
    p.get_alveoli_surface_area().set_value(area['Value'] / 10000 * (1 + config['surface']/100), AreaUnit.m2)
if config['volume']:
    volume = reference['TotalLungCapacity']['ScalarVolume']
    assert volume['Unit'] == 'L'
    p.get_total_lung_capacity().set_value(volume['Value'] * (1 + config['volume']/100), VolumeUnit.L)
requests = SEDataRequestManager([SEDataRequest.create_physiology_request(n, unit=u) for n, u in properties])
if not e.initialize_engine(pc, requests):
    raise RuntimeError('Body configuration did not stabilize')
initial = SEPatient()
e.get_initial_patient(initial)
serialize_patient_to_file(initial, str(out.with_suffix('.patient.json')))
stabilized = dict(zip(names, e.pull_data()[1:]))

def action_checked(action):
    # Public wrapper drops the native success return in this exact release.
    encoded = serialize_actions_to_string([action], eSerializationFormat.JSON)
    if not e._PulseEngine__pulse.process_actions(encoded, PyPulse.serialization_format.json):
        raise RuntimeError('Native engine rejected an action')

if config['breathing']:
    action = SERespiratoryMechanicsModification()
    action.set_incremental(True)  # Keep transients; no hidden 600s restabilization.
    action.get_modifiers().get_respiration_rate_multiplier().set_value(1 + config['breathing']/100)
    action_checked(action)
if any(config[k] for k in ['stroke', 'heartRate', 'resistance']):
    action = SECardiovascularMechanicsModification()
    action.set_incremental(True)
    for k, getter in [('stroke', 'get_stroke_volume_multiplier'), ('heartRate', 'get_heart_rate_multiplier'), ('resistance', 'get_systemic_resistance_multiplier')]:
        if config[k]:
            getattr(action.get_modifiers(), getter)().set_value(1 + config[k]/100)
    action_checked(action)
if config['pressure'] != 760:
    action = SEChangeEnvironmentalConditions()
    action.get_environmental_conditions().get_atmospheric_pressure().set_value(config['pressure'], PressureUnit.mmHg)
    action_checked(action)
if config['exercise']:
    action = SEExercise()
    action.get_intensity().set_value(config['exercise'])
    action_checked(action)
e.advance_time_s(0)
post_time = float(e.pull_data()[0])
rows = []
first_events = {}
dense = []
stopped = False
# Only source-audited event classifications are surfaced. Raw upstream hypocapnia is faulty.
allowed = {'Hypoxia', 'RespiratoryAlkalosis'}
for elapsed in range(0, 181, 10):
    if elapsed and not e.advance_time_s(10):
        stopped = True
        break
    values = e.pull_data().tolist()
    if not all(math.isfinite(v) for v in values):
        raise RuntimeError('Non-finite engine output')
    active = [x.event.name for x in e.pull_active_events() if x.active and x.event.name in allowed]
    rows.append({'elapsed_s': elapsed, 'values': dict(zip(names, values[1:])), 'events': active})
for tick in range(1500):
    if not e.advance_time_s(.02):
        stopped = True
        break
    values = e.pull_data().tolist()
    if not all(math.isfinite(v) for v in values):
        raise RuntimeError('Non-finite engine output')
    dense.append(values)
# The release's Python event-handler API calls a missing native binding.
# Retain exact native log event-entry timestamps instead of silently dropping transients.
# Event measurements below are nearest subsequent retained samples, labeled separately.
e.clear()
log = out.with_suffix('.log').read_text()
post_log = log.split('Tracking post stabilization')[-1]
for match in re.finditer(r'\[([0-9.]+)\(s\)\] \[Event (Hypoxia|RespiratoryAlkalosis) 1\]', post_log):
    elapsed = float(match[1]) - post_time
    if not 0 <= elapsed <= 210 or match[2] in first_events:
        continue
    if elapsed <= 180:
        sample = rows[min(math.ceil(elapsed / 10), 18)]
        observed = sample['elapsed_s']
        values = sample['values']
    else:
        index = min(max(math.ceil((elapsed-180)/.02)-1, 0), 1499)
        observed = 180 + (index+1)*.02
        values = dict(zip(names, dense[index][1:]))
    first_events[match[2]] = {'event': match[2], 'elapsed_s': elapsed, 'sample_elapsed_s': observed, 'values': values}
for event in rows[0]['events']:
    if event not in first_events:
        first_events[event] = {'event': event, 'elapsed_s': 0, 'sample_elapsed_s': 0, 'values': rows[0]['values']}
if stopped or len(dense) != 1500 or len(rows) != 19:
    raise RuntimeError('Engine stopped before the complete comparison window; no valid result')
means = {n: sum(row[j+1] for row in dense)/len(dense) for j, n in enumerate(names)}
record = {'version': version(), 'git_hash': git_hash(), 'configuration': config,
 'property_units': {n: str(u) if u else 'unitless' for n, u in properties},
 'stabilized_values': stabilized, 'patient': json.loads(out.with_suffix('.patient.json').read_text()),
 'warnings': [line for line in log.splitlines() if '[WARN]' in line],
 'post_actions_engine_time_s': post_time, 'rows': rows, 'dense_rows': dense,
 'trailing_30s_mean': means, 'events': list(first_events.values()), 'stopped': stopped}
out.write_text(json.dumps(record, allow_nan=False))
