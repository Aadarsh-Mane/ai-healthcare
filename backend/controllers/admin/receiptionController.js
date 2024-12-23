import { client } from "../../helpers/twilio.js";
import Appointment from "../../models/bookAppointmentSchema.js";
import hospitalDoctors from "../../models/hospitalDoctorSchema.js";
import PatientHistory from "../../models/patientHistorySchema.js";
import patientSchema from "../../models/patientSchema.js";
import { sendNotification } from "../notifyController.js";
import dayjs from "dayjs";

export const addPatient = async (req, res) => {
  const {
    name,
    age,
    gender,
    contact,
    address,
    weight,
    caste,
    reasonForAdmission,
    symptoms,
    initialDiagnosis,
  } = req.body;

  try {
    let patient = await patientSchema.findOne({ name, contact });

    if (patient) {
      let daysSinceLastAdmission = null;

      // Check if the patient has been discharged
      if (!patient.discharged) {
        // If not discharged, calculate days since last admission
        if (patient.admissionRecords.length > 0) {
          const lastAdmission =
            patient.admissionRecords[patient.admissionRecords.length - 1]
              .admissionDate;
          daysSinceLastAdmission = dayjs().diff(dayjs(lastAdmission), "day");
        }
      } else {
        // Patient has been discharged, check history for the last discharge date
        let patientHistory = await PatientHistory.findOne({
          patientId: patient.patientId,
        });

        if (patientHistory) {
          // Fetch the latest discharge date from the history
          const lastDischarge = patientHistory.history
            .filter((entry) => entry.dischargeDate)
            .sort((a, b) =>
              dayjs(b.dischargeDate).isBefore(a.dischargeDate) ? -1 : 1
            )[0];

          if (lastDischarge) {
            // Calculate the days since last discharge
            daysSinceLastAdmission = dayjs().diff(
              dayjs(lastDischarge.dischargeDate),
              "day"
            );
          }
        }

        // Set discharged status to false for re-admission
        patient.discharged = false;
      }

      // Add new admission record
      patient.admissionRecords.push({
        admissionDate: new Date(),
        reasonForAdmission,
        symptoms,
        initialDiagnosis,
      });

      // Save updated patient record
      await patient.save();

      return res.status(200).json({
        message: `Patient ${name} re-admitted successfully.`,
        patientDetails: patient,
        daysSinceLastAdmission,
        admissionRecords: patient.admissionRecords,
      });
    }

    // If patient does not exist, create a new one with a generated patientId
    const patientId = generatePatientId(name);

    patient = new patientSchema({
      patientId,
      name,
      age,
      gender,
      contact,
      address,
      weight,
      caste,
      admissionRecords: [
        {
          admissionDate: new Date(),
          reasonForAdmission,
          symptoms,
          initialDiagnosis,
        },
      ],
    });
    await patient.save();
    // const messageBody = `Dear ${name}, welcome to our spandan hospital. Your patient ID is ${patientId}. Wishing you a speedy recovery!`;

    // await client.messages.create({
    //   from: "+14152149378", // Twilio phone number
    //   to: contact,
    //   body: messageBody,
    // });

    res.status(200).json({
      message: `Patient ${name} added successfully with ID ${patientId}.`,
      patientDetails: patient,
    });
  } catch (error) {
    console.error("Error adding patient:", error);
    res
      .status(500)
      .json({ message: "Error adding patient", error: error.message });
  }
};
const generatePatientId = (name) => {
  const initials = name.slice(0, 3).toUpperCase(); // First three letters of the name
  const randomDigits = Math.floor(100 + Math.random() * 900); // Generate three random digits
  return `${initials}${randomDigits}`;
};

export const acceptAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  const { note } = req.body; // Optional note field

  try {
    // Find the appointment by ID
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Update status and note
    appointment.status = "Confirmed";
    if (note) appointment.note = note;

    await appointment.save();

    res.status(200).json({
      message: `Appointment for ${appointment.name} confirmed successfully.`,
      appointmentDetails: appointment,
    });
  } catch (error) {
    console.error("Error confirming appointment:", error);
    res
      .status(500)
      .json({ message: "Error confirming appointment", error: error.message });
  }
};
export const assignDoctor = async (req, res) => {
  try {
    const { patientId, doctorId, admissionId, isReadmission } = req.body;

    // Find the patient
    const patient = await patientSchema.findOne({ patientId });
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // Find the doctor
    const doctor = await hospitalDoctors.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Check if admission record exists
    const admissionRecord = patient.admissionRecords.id(admissionId);
    if (!admissionRecord) {
      return res.status(404).json({ message: "Admission record not found" });
    }

    // Assign doctor to admission record
    admissionRecord.doctor = { id: doctorId, name: doctor.doctorName };
    await patient.save();

    // Check if doctor has FCM token
    if (doctor.fcmToken) {
      // Send notification to the doctor
      const title = "New Patient Assignment";
      const body = `You have been assigned a new patient: ${patient.name}`;
      await sendNotification(doctor.fcmToken, title, body);
    } else {
      console.warn("Doctor does not have an FCM token. Notification not sent.");
    }

    return res
      .status(200)
      .json({ message: "Doctor assigned successfully", patient });
  } catch (error) {
    console.error("Error assigning doctor:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// Controller to list all available doctors
export const listDoctors = async (req, res) => {
  try {
    // Retrieve all doctors, with an option to filter by availability if required
    const doctors = await hospitalDoctors
      .find({
        usertype: "doctor",
        // available: true,
      })
      .select("-password -createdAt -fcmToken");

    if (!doctors || doctors.length === 0) {
      return res.status(404).json({ message: "No available doctors found." });
    }

    res.status(200).json({ doctors });
  } catch (error) {
    console.error("Error listing doctors:", error);
    res
      .status(500)
      .json({ message: "Failed to retrieve doctors.", error: error.message });
  }
};
// Controller to list all patients
export const listPatients = async (req, res) => {
  try {
    // Retrieve all patients from the database
    const patients = await patientSchema.find();

    if (!patients || patients.length === 0) {
      return res.status(404).json({ message: "No patients found." });
    }

    res.status(200).json({ patients });
  } catch (error) {
    console.error("Error listing patients:", error);
    res
      .status(500)
      .json({ message: "Failed to retrieve patients.", error: error.message });
  }
};
export const getDoctorsPatient = async (req, res) => {
  try {
    const { doctorName } = req.params; // Assuming doctor name is passed as a query parameter

    // Find patients where any admission record has the specified doctor name
    const patients = await patientSchema.find({
      admissionRecords: {
        $elemMatch: { "doctor.name": doctorName },
      },
    });

    // If no patients are found, return a 404 message
    if (!patients || patients.length === 0) {
      return res
        .status(404)
        .json({ message: "No patients found for this doctor" });
    }

    // Return the list of patients assigned to this doctor
    return res.status(200).json({ patients });
  } catch (error) {
    console.error("Error retrieving doctor's patients:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
