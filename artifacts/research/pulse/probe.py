import argparse, json, time
import PyPulse
from pulse.cdm.enums import eSerializationFormat
from pulse.cdm.io.engine import serialize_actions_to_string
from pathlib import Path
from pulse.engine.PulseEngine import PulseEngine, version, git_hash
from pulse.cdm.engine import SEDataRequest, SEDataRequestManager
from pulse.cdm.patient import SEPatientConfiguration, SEPatient, eSex
from pulse.cdm.patient_actions import SEExercise, SERespiratoryMechanicsModification
from pulse.cdm.environment_actions import SEChangeEnvironmentalConditions
from pulse.cdm.scalars import *
from pulse.cdm.io.patient import serialize_patient_to_file, serialize_patient_from_file

ap = argparse.ArgumentParser()
ap.add_argument('--case', default='baseline')
ap.add_argument('--out', required=True)
ap.add_argument('--reference')
ap.add_argument('--surface', type=float, default=1)
ap.add_argument('--volume', type=float, default=1)
ap.add_argument('--breathing', type=float, default=1)
ap.add_argument('--exercise', type=float, default=0)
ap.add_argument('--pressure', type=float, default=760)
ap.add_argument('--seconds', type=int, default=180)
ap.add_argument('--sudden', action='store_true')
a = ap.parse_args()
out = Path(a.out).resolve(); out.parent.mkdir(parents=True, exist_ok=True)
properties = [('HeartRate', FrequencyUnit.Per_min), ('RespirationRate', FrequencyUnit.Per_min),
 ('OxygenSaturation', None), ('BloodPH', None), ('ArterialCarbonDioxidePressure', PressureUnit.mmHg),
 ('ArterialOxygenPressure', PressureUnit.mmHg), ('MeanArterialPressure', PressureUnit.mmHg),
 ('CardiacOutput', VolumePerTimeUnit.L_Per_min), ('CerebralBloodFlow', VolumePerTimeUnit.mL_Per_min),
 ('TotalPulmonaryVentilation', VolumePerTimeUnit.L_Per_min), ('TidalVolume', VolumeUnit.mL),
 ('CoreTemperature', TemperatureUnit.C), ('TotalMetabolicRate', PowerUnit.W)]
requests = SEDataRequestManager([SEDataRequest.create_physiology_request(n, unit=u) for n,u in properties])
e = PulseEngine(); e.log_to_console(False); e.set_log_filename(str(out.with_suffix('.log')))
pc = SEPatientConfiguration(); p = pc.get_patient()
p.set_sex(eSex.Male); p.set_name('HumanV2Reference')
p.get_age().set_value(44, TimeUnit.yr)
p.get_height().set_value(180.34, LengthUnit.cm)
p.get_weight().set_value(77.1107, MassUnit.kg)
if a.reference:
 reference=SEPatient(); serialize_patient_from_file(a.reference, reference)
 if a.surface != 1:
  p.get_alveoli_surface_area().set_value(reference.get_alveoli_surface_area().get_value(AreaUnit.m2)*a.surface, AreaUnit.m2)
 if a.volume != 1:
  p.get_total_lung_capacity().set_value(reference.get_total_lung_capacity().get_value(VolumeUnit.L)*a.volume, VolumeUnit.L)
def action_checked(action):
 # Upstream Python process_action discards the native success boolean.
 # Qualify through its bound native method, retaining rejection detection.
 encoded=serialize_actions_to_string([action], eSerializationFormat.JSON)
 if not e._PulseEngine__pulse.process_actions(encoded, PyPulse.serialization_format.json):
  raise RuntimeError('Native engine rejected action; see log')
start=time.perf_counter()
if not e.initialize_engine(pc, requests):
 raise RuntimeError('Patient did not stabilize; see log')
initial=SEPatient(); e.get_initial_patient(initial)
serialize_patient_to_file(initial, str(out.with_suffix('.patient.json')))
stabilized=e.pull_data().copy()
mod=SERespiratoryMechanicsModification()
mod.set_incremental(a.sudden)
if a.breathing != 1:
 mod.get_modifiers().get_respiration_rate_multiplier().set_value(a.breathing)
 action_checked(mod)
if a.pressure != 760:
 change=SEChangeEnvironmentalConditions()
 change.get_environmental_conditions().get_atmospheric_pressure().set_value(a.pressure, PressureUnit.mmHg)
 action_checked(change)
if a.exercise:
 exercise=SEExercise(); exercise.get_intensity().set_value(a.exercise)
 action_checked(exercise)
e.advance_time_s(0)
post_actions_time=e.pull_data()[0]
rows=[]
for elapsed in range(0,a.seconds+1,10):
 if elapsed and not e.advance_time_s(10):
  rows.append({'elapsed_s':elapsed,'engineStopped':True}); break
 values=e.pull_data()
 events=e.pull_active_events()
 rows.append({'elapsed_s':elapsed,'engine_time_s':values[0],
  'values':dict(zip([n for n,u in properties],values[1:])),
  'events':[{'event':x.event.name,'active':x.active,'duration_s':x.duration_s} for x in events]})
# Brain inflow is instantaneous. Average complete dense time samples rather
# than reporting one arbitrary cardiac phase as an intervention effect.
dense=[]
for i in range(1500):
 if not e.advance_time_s(0.02): break
 dense.append(e.pull_data().tolist())
means={n:sum(row[j+1] for row in dense)/len(dense) for j,(n,u) in enumerate(properties)} if dense else None
result={'dense_rows':dense,'post_actions_engine_time_s':post_actions_time,'trailing_30s_dt_s':0.02,'trailing_30s_mean':means,'version':version(),'git_hash':git_hash(),'arguments':vars(a),
 'property_units':{n:str(u) if u else 'unitless' for n,u in properties},
 'stabilized_values':dict(zip([n for n,u in properties],stabilized[1:])),
 'wall_seconds':time.perf_counter()-start,'rows':rows}
out.write_text(json.dumps(result,indent=2,allow_nan=False))
print(json.dumps({'case':a.case,'wall_seconds':result['wall_seconds'],'last':rows[-1]}),flush=True)
e.clear()
